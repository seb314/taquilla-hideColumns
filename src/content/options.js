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
  let kAlt;
  let kMeta;
  let kShift;
  let kControl;

  function cdump(msg) {
    //kConsoleService.logStringMessage(msg);
  }

  // global scope variables

  // append on object to hold external references
  this.taquillaOptions = {};

  // local shorthand for the global reference
  let that = this.taquillaOptions;

  Cu.import("resource://taquilla/taquilla.jsm");

  // local private variables

  // document elements to enable a tag for processing
  let _tagChecks = [];

  // document elements with percent cutoff for setting tag
  let _tagPercents = [];

  const _prefs = Cc["@mozilla.org/preferences-service;1"]
                    .getService(Ci.nsIPrefService)
                    .getBranch("extensions.taquilla.");

  const _tagService = Cc["@mozilla.org/messenger/tagservice;1"]
                         .getService(Ci.nsIMsgTagService);

  const _rootprefs = Cc["@mozilla.org/preferences-service;1"]
                        .getService(Ci.nsIPrefService)
                        .getBranch("");

  // base value of the property to enable bayes
  const _dobayesBase = "dobayes.taquilla@mesquilla.com#tag.";

  // After accepting softtag option dialog, update preferences
  that.onAccept = function onAccept()
  { try {
    for (let i = 0; i < _tagChecks.length; ++i)
    {
      let tagKey = _tagChecks[i].getAttribute("tagkey");
      _prefs.setBoolPref(tagKey + ".isSoft", _tagChecks[i].checked);
      _prefs.setIntPref(tagKey + ".percent", _tagPercents[i].value);
    }

    let tagDefaults = document.getElementsByClassName("tagdefault");
    for (let i = 0; i < tagDefaults.length; i++)
    {
      let tagKey = tagDefaults[i].getAttribute("tagkey");
      let defaultProperty = "mail.server.default." + _dobayesBase + tagKey + ".pro";
      let defaultEnabled = "";
      try {
        defaultEnabled = _rootprefs.getCharPref(defaultProperty);
      }
      catch (e) {}
      let defaultOld = (defaultEnabled == "true");

      let defaultNew = (tagDefaults[i].getAttribute("checked") == "true");
      if (defaultNew != defaultOld)
      { 
        _rootprefs.setCharPref(defaultProperty, defaultNew ? "true" : "");
      }
    }

    let isEnabled = document.getElementById('setClearCheckBox').checked;
    _prefs.setBoolPref('setClearEnabled', isEnabled);
    if (isEnabled)
    {
      let tagSets = document.getElementsByClassName('tagset');
      for (let i = 0; i < tagSets.length; i++)
      {
        let tagNumber = tagSets[i].getAttribute('tagnumber');
        let key = tagSets[i].value.charAt(0);
        let modifiers = tagSets[i].getAttribute('modifiers');
        _prefs.setCharPref('setKey' + tagNumber, key);
        _prefs.setCharPref('setModifiers' + tagNumber, modifiers);
      }

      let tagClears = document.getElementsByClassName('tagclear');
      for (let i = 0; i < tagClears.length; i++)
      {
        let tagNumber = tagClears[i].getAttribute('tagnumber');
        let key = tagClears[i].value.charAt(0);
        let modifiers = tagClears[i].getAttribute('modifiers');
        _prefs.setCharPref('clearKey' + tagNumber, key);
        _prefs.setCharPref('clearModifiers' + tagNumber, modifiers);
      }
    }

    Cc["@mozilla.org/preferences-service;1"]
       .getService(Ci.nsIPrefService)
       .savePrefFile(null);

    // now reinitialize

    if (isEnabled)
      taquilla.enableTagSetClear(null);
    else
      taquilla.disableTagSetClear(null);
    taquilla.setupTraits();

  } catch (e) {Cu.reportError(e);}}

  let _keyHandler = {
    handleEvent: function taquilla_handleEvent(event)
    {

      // only operate on key shortcut set and clear tags
      let target = event.target;
      let elementClass = target.getAttribute('class');
      if ( !(elementClass == 'tagset' || elementClass == 'tagclear') )
        return;

      // for non character code keys, we will just use default action
      if (!event.charCode)
        return;

      let val = String.fromCharCode(event.charCode) + ' ';
      let modifiers = "";
      if (event.altKey) {
        val += kAlt;
        modifiers += 'alt ';
      }
      if (event.metaKey) {
        val += kMeta;
        modifiers += 'meta ';
      }
      if (event.ctrlKey) {
        val += kControl;
        modifiers += 'control ';
      }
      if (event.shiftKey) {
        val += kShift;
        modifiers += 'shift ';
      }
      event.preventDefault();
      target.value = val;
      target.setAttribute('modifiers', modifiers);
    }
  }

  that.onLoadOptions = function onLoadOptions() {
    let strbundle = document.getElementById("taquilla-strings");
    kAlt = strbundle.getString("Alt");
    kMeta = strbundle.getString("Meta");
    kShift = strbundle.getString("Shift");
    kControl = strbundle.getString("Control");

    _buildTagList();
    //experimental key event handler
    let vbox = document.getElementById('taquillaOptionsBox');
    vbox.addEventListener('keypress', _keyHandler, false);
  }

  // adds XUL elements for softtag options
  function _buildTagList()
  { try {
    let tagArray = _tagService.getAllTags({});
    let tagRows = document.getElementById("tagrows");
    let setClearEnabled = false;
    try {
      setClearEnabled = _prefs.getBoolPref('setClearEnabled');
    } catch (e) {}
    document.getElementById('setClearCheckBox').checked = setClearEnabled;

    for (let i = 0; i < tagArray.length; ++i)
    {
      let tagInfo = tagArray[i];
      let tagRow = document.createElement("row");
      let tagTag = document.createElement("label");
      let tagPercent = document.createElement("textbox");
      let tagCheck = document.createElement("checkbox");
      let tagDefault = document.createElement("checkbox");

      let isSoft = false;
      try {
        isSoft = _prefs.getBoolPref(tagInfo.key + ".isSoft");
      }
      catch(e) {}

      let percent = 50;
      try {
        percent = _prefs.getIntPref(tagInfo.key + ".percent");
      }
      catch (e) {}

      let defaultEnabled = "";
      try {
        let defaultProperty = "mail.server.default." + _dobayesBase + tagInfo.key + ".pro";
        defaultEnabled = _rootprefs.getCharPref(defaultProperty);
      }
      catch (e) {}


      tagCheck.setAttribute("checked", isSoft);
      tagCheck.setAttribute("tagkey", tagInfo.key);
      tagCheck.setAttribute("class", "tagenable");
      tagDefault.setAttribute("checked", defaultEnabled == "true");
      tagDefault.setAttribute("tagkey", tagInfo.key);
      tagDefault.setAttribute("class", "tagdefault");
      tagPercent.setAttribute("value", percent);
      tagPercent.setAttribute("type", "number");
      tagPercent.setAttribute("min", "0");
      tagPercent.setAttribute("max", "100");
      tagPercent.setAttribute("width", "20");
      tagPercent.setAttribute("class", "tagpercent");
      tagTag.setAttribute("value", tagInfo.tag);
      tagRow.appendChild(tagTag);
      // surround checkboxes by hboxes to center
      let checkHbox = document.createElement('hbox');
      checkHbox.setAttribute('pack', 'center');
      checkHbox.appendChild(tagCheck);
      let defaultHbox = document.createElement('hbox');
      defaultHbox.setAttribute('pack', 'center');
      defaultHbox.appendChild(tagDefault);
      tagRow.appendChild(checkHbox);
      tagRow.appendChild(defaultHbox);
      tagRow.appendChild(tagPercent);
      _tagChecks.push(tagCheck);
      _tagPercents.push(tagPercent);

      let tagNumber = i + 1;
      if (tagNumber < 10)
      {
        let tagSet = document.createElement("textbox");
        let tagClear = document.createElement("textbox");
        let key = '' + tagNumber;
        try {
          key = _prefs.getCharPref('setKey' + tagNumber);
        } catch (e) {}
        let modifiers = '';
        try {
          modifiers = _prefs.getCharPref('setModifiers' + tagNumber);
        } catch (e) {}
        let value = key + ' ';
        if (modifiers.indexOf('alt') >= 0)
          value += kAlt;
        if (modifiers.indexOf('meta') >= 0)
          value += kMeta;
        if (modifiers.indexOf('shift') >= 0)
          value += kShift;
        if (modifiers.indexOf('control') >= 0)
          value += kControl;
        tagSet.setAttribute('value', value);
        tagSet.setAttribute('modifiers', modifiers);

        key = '' + tagNumber;
        try {
          key = _prefs.getCharPref('clearKey' + tagNumber);
        } catch (e) {}
        modifiers = 'alt';
        try {
          modifiers = _prefs.getCharPref('clearModifiers' + tagNumber);
        } catch (e) {}
        value = key + ' ';
        if (modifiers.indexOf('alt') >= 0)
          value += kAlt;
        if (modifiers.indexOf('meta') >= 0)
          value += kMeta;
        if (modifiers.indexOf('shift') >= 0)
          value += kShift;
        if (modifiers.indexOf('control') >= 0)
          value += kControl;
        tagClear.setAttribute('value', value);
        tagClear.setAttribute('modifiers', modifiers);
        tagSet.setAttribute("class", 'tagset');
        tagSet.setAttribute('tagnumber', tagNumber);
        if (!setClearEnabled)
          tagSet.setAttribute('disabled', 'true');
        tagClear.setAttribute('class', 'tagclear');
        tagClear.setAttribute('tagnumber', tagNumber);
        if (!setClearEnabled)
          tagClear.setAttribute('disabled', 'true');
        tagRow.appendChild(tagSet);
        tagRow.appendChild(tagClear);
      }

      tagRows.appendChild(tagRow);
    }
    window.sizeToContent();
    } catch(e) {Cu.reportError(e);}
  }

  that.onSetClearCheck = function onSetClearCheck()
  {
    let isEnabled = document.getElementById('setClearCheckBox').checked;

    let tagSets = document.getElementsByClassName('tagset');
    for (let i = 0; i < tagSets.length; i++)
      isEnabled? tagSets[i].removeAttribute('disabled') :
                 tagSets[i].setAttribute('disabled', 'true'); 

    let tagClears = document.getElementsByClassName('tagclear');
    for (let i = 0; i < tagClears.length; i++)
      isEnabled ? tagClears[i].removeAttribute('disabled') :
                  tagClears[i].setAttribute('disabled', 'true');
  }

})();

window.addEventListener("load", function(e) { taquillaOptions.onLoadOptions(); }, false);
