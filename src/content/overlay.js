/*
 ***** BEGIN LICENSE BLOCK *****
 * This file is part of the application TaQuilla by Mesquilla.
 *
 * This application is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * You should have received a copy of the GNU General Public License
 * along with this application.  If not, see <http://www.gnu.org/licenses/>.
 * 
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Mesquilla code.
 *
 * The Initial Developer of the Original Code is
 * Kent James <rkent@mesquilla.com>
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * ***** END LICENSE BLOCK *****
 */
 
(function()
{
  const Cc = Components.classes;
  const Ci = Components.interfaces;
  const Cu = Components.utils;
  const kConsoleService = Cc["@mozilla.org/consoleservice;1"]
                             .getService(Ci.nsIConsoleService);

  function _cdump(msg) {
    //kConsoleService.logStringMessage(msg);
    //window.dump(msg + "\n");
  }

  Cu.import("resource://taquilla/taquilla.jsm");

  let prefs = Cc["@mozilla.org/preferences-service;1"]
                .getService(Ci.nsIPrefService);
  prefs = prefs.getBranch("extensions.taquilla.");

  // global scope variables
  this.taquillaOverlay = {};

  // local shorthand for the global reference
  let that = this.taquillaOverlay;

  that.initialized = false;

  // private module variables
  const traitIdBase = "taquilla@mesquilla.com#tag.";
  const bayesIdBase = "bayespercent/" + traitIdBase;
  const tagService = Cc["@mozilla.org/messenger/tagservice;1"]
                        .getService(Ci.nsIMsgTagService);


  // extension initialization

  that.onLoad = function()
  {
    if (that.initialized)
      return;
    taquilla.addWindow(window);
    taquilla.setupTraits();

    // Shall we override the default toggle key for tag with set/clear keys?
    let setClearEnabled = false;
    try {
      setClearEnabled = prefs.getBoolPref('setClearEnabled');
    } catch (e) {}
    if (setClearEnabled)
      taquilla.enableTagSetClear(window);
    else
      taquilla.disableTagSetClear(window);
  };
  
  that.onUnload = function ()
  {
    let ObserverService = Cc["@mozilla.org/observer-service;1"]
                         .getService(Ci.nsIObserverService);

    try {
      ObserverService.removeObserver(_CreateDbObserver, "MsgCreateDBView");
    } catch (e) {} // will fail normally if observer never added

    taquilla.removeWindow(window);
    taquilla.manageDbListeners(false);
  };
  
  /****************************************************************************
   * Custom column management
   */
  const MSG_VIEW_FLAG_DUMMY = 0x20000000;

  // we need an atom to detect dummy rows
  let atomService = Cc["@mozilla.org/atom-service;1"].getService(Ci.nsIAtomService);
  const dummyAtom = atomService.getAtom("dummy");
  atomService = null;

  // an empty column handler
  function _ColumnHandler()
  {
   this.getCellText =         function(row, col) {return null};
   this.getSortStringForRow = function(hdr) {return null};
   this.isString =            function() {return true};
   this.getCellProperties =   function(row, col, props) {return null};
   this.getImageSrc =         function(row, col) {return null;};
   this.getSortLongForRow =   function(hdr) {return null};
   this.getRowProperties =    function(index, properties) {return null;}
  }

  function _PercentColumnHandler(propertyName, sortString)
  {
    this.propertyName = propertyName;
    this.sortString = sortString;
  }

  _PercentColumnHandler.prototype = new _ColumnHandler();

  _PercentColumnHandler.prototype.getCellText = function(row, col)
  {
    // Is this a dummy row?
    let treeView = gDBView.QueryInterface(Ci.nsITreeView);
    if (treeView)
    {
      let props = Cc["@mozilla.org/supports-array;1"].
                  createInstance(Ci.nsISupportsArray);
      treeView.getCellProperties(row, col, props);
      if (props.GetIndexOf(dummyAtom) >= 0)
        return "";
    }

    let key = gDBView.getKeyAt(row);
    let hdr = gDBView.getFolderForViewIndex(row).GetMessageHeader(key);
    let percent = hdr.getStringProperty(this.propertyName);
    // we add 1000 to show a change, so remove this for display
    let realPercent = parseInt(percent) % 1000;
    if (!isNaN(realPercent))
      return realPercent;
    else
      return null;
  }

  _PercentColumnHandler.prototype.isString = function()
  {
    return this.sortString;
  }

  _PercentColumnHandler.prototype.getSortStringForRow = function(hdr)
  {
    return hdr.getStringProperty(this.propertyName);
  }

  _PercentColumnHandler.prototype.getSortLongForRow = function(hdr)
  {
    let value = hdr.getStringProperty(this.propertyName);
    if (!value)
    {
      return 0;
    }
    value = parseInt(value);
    if (value == NaN)
    {
      return 1;
    }
    return 2 + value;
  }

  function _TraitSourceColumnHandler(keyword)
  {
    this.keyword = keyword;
    this.propertyName = traitIdBase + keyword;
  }

  _TraitSourceColumnHandler.prototype = new _ColumnHandler();

  _TraitSourceColumnHandler.prototype.isString = function()
  {
    return false;
  }

  _TraitSourceColumnHandler.prototype.getSortLongForRow = function(hdr)
  {
    try {
      let source = hdr.getStringProperty(traitIdBase + this.keyword);
      let percent = hdr.getStringProperty(bayesIdBase + this.keyword + ".pro");
      let sourceOffset;
      switch (source)
      {
        case "soft" :
        case "presoft" :
          sourceOffset = 1000;
          break;
        case "hard" :
          sourceOffset = 2000;
          break;
        default:
          sourceOffset = 0;
      }
      let percentOffset;
      if (!percent)
        percentOffset = 0;
      else {
        percent = parseInt(percent);
        if (percent == NaN)
          percentOffset = 1;
        else
          percentOffset = 2 + percent;
      }
      return sourceOffset + percentOffset;
    }
    catch (e) {
      return null;
    }
  }

  _TraitSourceColumnHandler.prototype.getImageSrc = function(row, col)
  {
    // Is this a dummy row?
    let treeView = gDBView.QueryInterface(Ci.nsITreeView);
    if (treeView)
    {
      let props = Cc["@mozilla.org/supports-array;1"].
                  createInstance(Ci.nsISupportsArray);
      treeView.getCellProperties(row, col, props);
      if (props.GetIndexOf(dummyAtom) >= 0)
        return null;
    }

    let key = gDBView.getKeyAt(row);
    let hdr = gDBView.getFolderForViewIndex(row).GetMessageHeader(key);
    let value = hdr.getStringProperty(this.propertyName);
    switch (hdr.getStringProperty(this.propertyName))
    {
      case "hard" :
        return "chrome://taquilla/skin/check.png";
      case "soft" :
        return "chrome://taquilla/skin/sigma.png";
      case "presoft" :
        return "chrome://taquilla/skin/sigma.png";
      default:
        return null;
    }
  }

  //_TraitSourceColumnHandler.prototype.getSortStringForRow = function(hdr)
  //{
  //  return hdr.getStringProperty(this.propertyName);
  //}

  function _addCustomColumnHandler(aMsgFolder)
  {
    // remove any existing columns
    let oldColumns = document.getElementsByAttribute("taquillaColumn", "true");
    for (let i = oldColumns.length - 1; i >= 0; i--)
      oldColumns[i].parentNode.removeChild(oldColumns[i]);
    if (!_filterFolderForTraits(aMsgFolder))
      return;

    try {
      for (let i = 0; i < taquilla.enabledTags.length; i++)
      {
        let tagkey = taquilla.enabledTags[i];
        let tagId = traitIdBase + tagkey + ".pro";
        // test if soft tag is disabled for this folder
        let isEnabledOnFolder = aMsgFolder.getInheritedStringProperty("dobayes." + tagId);
        if (isEnabledOnFolder != "true")
          continue;


        // There is a bug in group view that only calls getCellText if the id for
        //  a custom column starts with "u"

        _addPercentColumn(tagkey);
        gDBView.addColumnHandler("utaquillaPercent." + tagkey, _columnHandlerPercents[tagkey]);

        _addStatusColumn(tagkey);
        gDBView.addColumnHandler("utaquillaStatus." + tagkey, _columnHandlerStatuses[tagkey]);
      }
    }
    catch(e) {
    }
  }

  function _addPercentColumn(tagkey)
  {
    try {
      let threadcols = document.getElementById("threadCols");
      let splitter = document.createElement("splitter");
      splitter.setAttribute("class", "tree-splitter");
      threadcols.appendChild(splitter);
      let treecol = document.createElement("treecol");
      treecol.setAttribute("id", "utaquillaPercent." + tagkey);
      treecol.setAttribute("persist", "ordinal width");
      treecol.setAttribute("currentView", "unthreaded");
      treecol.setAttribute("flex", "1");
      treecol.setAttribute("taquillaColumn", "true");
      let tagname = tagService.getTagForKey(tagkey);
      treecol.setAttribute("tooltiptext", "'" + tagname + "' percent match");
      treecol.setAttribute("label", tagname.substr(0, 1) + "%");
      //treecol.setAttribute("ignoreincolumnpicker", true);
      //treecol.setAttribute("hidden", "false");
      //treecol.setAttribute("class", "treecol-image");
      //treecol.setAttribute("src", "chrome://taquilla/skin/emblem-favorite.png");
      threadcols.appendChild(treecol);
    }
    catch (e)
    {
      //_cdump("Failed adding percent column, error is " + e);
    }
  }

  // add a custom status column to the view
  function _addStatusColumn(tagkey)
  {
    try {
      let threadcols = document.getElementById("threadCols");
      let splitter = document.createElement("splitter");
      splitter.setAttribute("class", "tree-splitter");
      threadcols.appendChild(splitter);
      let treecol = document.createElement("treecol");
      treecol.setAttribute("id", "utaquillaStatus." + tagkey);
      treecol.setAttribute("persist", "width ordinal");
      treecol.setAttribute("currentView", "unthreaded");
      treecol.setAttribute("taquillaColumn", "true");
      treecol.setAttribute("fixed", "true");
      let tagname = tagService.getTagForKey(tagkey);
      treecol.setAttribute("tooltiptext", "'" + tagname + "' source");
      treecol.setAttribute("label", tagname.substr(0, 1) + "?");
      //treecol.setAttribute("ignoreincolumnpicker", true);
      //treecol.setAttribute("class", "treecol-image");
      //treecol.setAttribute("src", "chrome://taquilla/skin/emblem-important.png");
      threadcols.appendChild(treecol);
    }
    catch (e) {
      //_cdump("Failed to add status column, error is " + e);}
    }
  }

  let _CreateDbObserver = {
    // Ci.nsIObserver
    observe: function(aMsgFolder, aTopic, aData)
    {
      //_cdump("observe");
      if (aMsgFolder)
        aMsgFolder.QueryInterface(Ci.nsIMsgFolder);
      _addCustomColumnHandler(aMsgFolder);
    }
  };

  let _columnHandlerPercents = {};
  let _columnHandlerStatuses = {};
  that.setupColumns = function setupColumns()
  {
    _columnHandlerPercents = {};
    _columnHandlerStatuses = {};
    //_cdump("_setupColumns");
    for (let i = 0; i < taquilla.enabledTags.length; i++)
    {
      let tagkey = taquilla.enabledTags[i];
      _columnHandlerPercents[tagkey] = new _PercentColumnHandler(bayesIdBase + tagkey + ".pro", false);
      _columnHandlerStatuses[tagkey] = new _TraitSourceColumnHandler(tagkey);
    }

    let ObserverService = Cc["@mozilla.org/observer-service;1"]
                             .getService(Ci.nsIObserverService);
    if (taquilla.enabledTags.length) {
      try {
        ObserverService.removeObserver(_CreateDbObserver, "MsgCreateDBView");
      } catch (e) {} // will fail normally on first call
      ObserverService.addObserver(_CreateDbObserver, "MsgCreateDBView", false);
    }
  }

  // Should we listen to this folder for trait changes? This is duped in the module, so
  // we should really figure out a common location somehow (and integrate into standard
  // MesQuilla inherited properties management)
  function _filterFolderForTraits(folder)
  {
    if (!folder)
      return false;
    /*
    var flags = folder.flags;

    var nsMsgFolderFlags = Ci.nsMsgFolderFlags;
    if (!(flags & nsMsgFolderFlags.Mail) ||
          folder.server.type == "rss" ||
          flags & (nsMsgFolderFlags.Junk | nsMsgFolderFlags.Trash |
                   nsMsgFolderFlags.SentMail | nsMsgFolderFlags.Queue |
                   nsMsgFolderFlags.Drafts | nsMsgFolderFlags.Templates |
                   nsMsgFolderFlags.ImapPublic | nsMsgFolderFlags.ImapOtherUser
                   | nsMsgFolderFlags.Virtual))
      return false;
    */
    return true;
  }

    /* end Custom Column Management ******************************************/

    /* replacement tagging function */
  that.SetMessageTagKey = function SetMessageTagKey(index, addKey)
  {
    // Shall we override the default toggle key for tag with set/clear keys?
    let setClearEnabled = false;
    try {
      setClearEnabled = prefs.getBoolPref('setClearEnabled');
    } catch (e) {}

    if (!setClearEnabled)
      return ToggleMessageTagKey(index); // use the standard toggle method

    if (GetNumSelectedMessages() < 1)
      return;
    var tagArray = tagService.getAllTags({});
    for (var i = 0; i < tagArray.length; ++i)
    {
      var key = tagArray[i].key;
      if (!--index)
      {
        // found the key, now set its state
        ToggleAndTrainMessageTag(key, addKey);
        return;
      }
    }
  }

  // adapted from TrainMessageTag in mailWindowOverlay.js
  function ToggleAndTrainMessageTag(key, addKey)
  {
    var messages = Components.classes["@mozilla.org/array;1"]
                             .createInstance(Components.interfaces.nsIMutableArray);
    var selectedMessages = gFolderDisplay.selectedMessages;
    var toggler = addKey ? "addKeywordsToMessages" : "removeKeywordsFromMessages";
    var prevHdrFolder = null;
    // this crudely handles cross-folder virtual folders with selected messages
    // that spans folders, by coalescing consecutive msgs in the selection
    // that happen to be in the same folder. nsMsgSearchDBView does this
    // better, but nsIMsgDBView doesn't handle commands with arguments,
    // and (un)tag takes a key argument.
    for (var i = 0; i < selectedMessages.length; ++i)
    {
      var msgHdr = selectedMessages[i];
      if (msgHdr.label)
      {
        // Since we touch all these messages anyway, migrate the label now.
        // If we don't, the thread tree won't always show the correct tag state,
        // because resetting a label doesn't update the tree anymore...
        let msg = Components.classes["@mozilla.org/array;1"]
                            .createInstance(Components.interfaces.nsIMutableArray);
        msg.appendElement(msgHdr, false);
        msgHdr.folder.addKeywordsToMessages(msg, "$label" + msgHdr.label);
        msgHdr.label = 0; // remove legacy label
      }

      if (prevHdrFolder != msgHdr.folder)
      {
        if (prevHdrFolder)
          prevHdrFolder[toggler](messages, key);
        messages.clear();
        prevHdrFolder = msgHdr.folder;
      }
      // Does the message currently have this keyword?
      let msgKeyArray = msgHdr.getStringProperty("keywords").split(" ");
      let hasKey = (msgKeyArray.indexOf(key) >= 0);
      if (addKey == hasKey) {
        // train directly, otherwise let the listener do it
        taquilla.trainIfNeeded(msgHdr, key, addKey, hasKey);
        continue; // don't need to change the keyword in the header
      }
      messages.appendElement(msgHdr, false);
    }
    if (prevHdrFolder && messages.length)
    {
      prevHdrFolder[toggler](messages, key);
    }
    OnTagsChange();
  }

})();

window.addEventListener("load", function(e) { taquillaOverlay.onLoad(e); }, false);
window.addEventListener("unload", function(e) { taquillaOverlay.onUnload(e); }, false );

