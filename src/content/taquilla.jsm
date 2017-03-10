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

var EXPORTED_SYMBOLS = ["taquilla"];
var taquilla = {};

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

const kConsoleService = Cc["@mozilla.org/consoleservice;1"]
                           .getService(Ci.nsIConsoleService);

function cdump(msg) {
  //kConsoleService.logStringMessage(msg);
}

let _onQuit = {
  observe: function taquilla_observe(aSubject, aTopic, aData) {
    nsIJunkMailPlugin.shutdown();
    nsIJunkMailPlugin = null;
  }
}

let observerService = Cc["@mozilla.org/observer-service;1"].
                        getService(Ci.nsIObserverService);
observerService.addObserver(_onQuit, "quit-application", false);
observerService = null;

Cu.import("resource://gre/modules/iteratorUtils.jsm");
Cu.import("resource://taquilla/inheritedPropertiesGrid.jsm");

const prefs = Cc["@mozilla.org/preferences-service;1"]
                .getService(Ci.nsIPrefService)
                .getBranch("extensions.taquilla.");
const rootprefs = Cc["@mozilla.org/preferences-service;1"]
                .getService(Ci.nsIPrefService)
                .getBranch("");
const traitService = Cc["@mozilla.org/msg-trait-service;1"]
                       .getService(Ci.nsIMsgTraitService);
const tagService = Cc["@mozilla.org/messenger/tagservice;1"]
                     .getService(Ci.nsIMsgTagService);
const traitIdBase = "taquilla@mesquilla.com#tag.";
const bayesIdBase = "bayespercent/" + traitIdBase;
const dobayesBase = "dobayes.taquilla@mesquilla.com#tag.";
const dbService = Cc["@mozilla.org/msgDatabase/msgDBService;1"]
                    .getService(Ci.nsIMsgDBService);
const accountManager = Cc["@mozilla.org/messenger/account-manager;1"]
                         .getService(Ci.nsIMsgAccountManager);
let nsIJunkMailPlugin = Cc["@mozilla.org/messenger/filter-plugin;1?name=bayesianfilter"]
                            .getService(Ci.nsIJunkMailPlugin);
const taquillaStrings = Cc["@mozilla.org/intl/stringbundle;1"]
                         .getService(Ci.nsIStringBundleService)
                         .createBundle("chrome://taquilla/locale/app.properties");;

// Add this listener so that we can update the tree when things change
const gMFNService = Cc["@mozilla.org/messenger/msgnotificationservice;1"]
                      .getService(Ci.nsIMsgFolderNotificationService);

// return an array of active soft tags, as tag keys
taquilla.getSofttagKeys = function()
{
  var softtagKeyArray = new Array();
  var tagArray = tagService.getAllTags({});
  for (var i = 0; i < tagArray.length; ++i)
  {
    var tagKey = tagArray[i].key;
    var isEnabled = false;
    try {
      isEnabled = prefs.getBoolPref(tagKey + ".isSoft");
    } catch(e) {}
    if (isEnabled)
      softtagKeyArray.push(tagKey);
  }
  return softtagKeyArray;
}

taquilla.enabledTags = [];
taquilla._percents = {};
_inheritedProperties = {};
_windows = [];

taquilla.addWindow = function addWindow(aWindow)
{
  if (_windows.indexOf(aWindow) == -1) {
    _windows.push(aWindow);
  }
}

taquilla.removeWindow = function removeWindow(aWindow)
{
  let index = _windows.indexOf(aWindow);
  if (index >= 0) {
    _windows.splice(index, 1);
  }
}

// change tag key behavior to set/clear.

let _tagToggleKeyDefaults = [];
let _tagToggleModifierDefaults = [];
// @parm aWindow  window containing keys. If null, set for all windows
taquilla.enableTagSetClear = function enableTagSetClear(aWindow)
{
  let lWindow = aWindow;
  let windowCount = 1;
  // do we need to save the attributes of the toggle elements, for possible
  // disabling of SetClear mode?
  let saveDefaults = (_tagToggleKeyDefaults.length == 0);
  if (!lWindow) {
    lWindow = _windows[0];
    windowCount = _windows.length;
  }
  for (let windowNumber = 0; windowNumber < windowCount; lWindow = _windows[++windowNumber])
  {
    for (let tagNumber = 1; tagNumber <= 9 ; tagNumber++)
    {
      // set key definitions
      let key = '' + tagNumber;
      try {
        key = prefs.getCharPref('setKey' + tagNumber);
      } catch (e) {}
      let modifiers = '';
      try {
        modifiers = prefs.getCharPref('setModifiers' + tagNumber);
      } catch (e) {}
      let setKeyElement = lWindow.document.getElementById('key_tag' + tagNumber);
      if (saveDefaults && (windowNumber == 0))
      {
        _tagToggleKeyDefaults.push(setKeyElement.getAttribute('key'));
        _tagToggleModifierDefaults.push(setKeyElement.getAttribute('modifiers'));
      }
      setKeyElement.setAttribute('key', key);
      setKeyElement.setAttribute('modifiers', modifiers);

      // clear key definitions
      key = '' + tagNumber;
      try {
        key = prefs.getCharPref('clearKey' + tagNumber);
      } catch (e) {}
      modifiers = '';
      try {
        modifiers = prefs.getCharPref('clearModifiers' + tagNumber);
      } catch (e) {}
      let clearKeyElement = lWindow.document.getElementById('key_tag' + tagNumber + 'clear');
      clearKeyElement.setAttribute('modifiers', modifiers);
      clearKeyElement.setAttribute('key', key);
    }
    lWindow.document.getElementById('taquillaTagKeys').removeAttribute('disabled');
  }
}

// @parm aWindow  window containing keys. If null, do for all windows
taquilla.disableTagSetClear = function disableTagSetClear(aWindow)
{
  if (_tagToggleKeyDefaults.length == 0)
    return; // setClear never enabled

  let lWindow = aWindow;
  let windowCount = 1;
  if (!lWindow) {
    lWindow = _windows[0];
    windowCount = _windows.length;
  }
  for (let windowNumber = 0; windowNumber < windowCount; lWindow = _windows[++windowNumber])
  {
    for (let tagNumber = 1; tagNumber <= 9 ; tagNumber++)
    {
      let setKeyElement = lWindow.document.getElementById('key_tag' + tagNumber);
      setKeyElement.setAttribute('key', _tagToggleKeyDefaults[tagNumber - 1]);
      setKeyElement.setAttribute('modifiers', _tagToggleModifierDefaults[tagNumber - 1]);
      // This does not seem to be enough to get it to take. I tried various methods to
      //  get it to accept the new values, but nothing seemed to work.
    }
    lWindow.document.getElementById('taquillaTagKeys').setAttribute('disabled', 'true');
  }
}


// using info in preferences, setup trait service for softtags
taquilla.setupTraits = function _setupTraits()
{
  // Remove any existing DB listeners
  taquilla.manageDbListeners(false);

  // clear the tag array, we will rewrite it
  taquilla.enabledTags = [];
  taquilla._percents = {};
  var tagArray = tagService.getAllTags({});
  for (var i = 0; i < tagArray.length; ++i)
  {
    var tagKey = tagArray[i].key;

    var isEnabled = false;
    try { isEnabled = prefs.getBoolPref(tagKey + ".isSoft");} catch (e) {}

    var percent = 50;
    try { percent = prefs.getIntPref(tagKey + ".percent");} catch(e) {}

    var traitIdPro = traitIdBase + tagKey + ".pro";
    var traitIdAnti = traitIdBase + tagKey + ".anti";

    var bayesListener = null;
    try {
      bayesListener = bayesListeners[tagKey];
    }
    catch (e) {}

    if (isEnabled)
    {
      taquilla.enabledTags.push(tagKey);
      taquilla._percents[tagKey] = percent;
      // register pro and anti traits for this tag
      var traitIndexPro = traitService.registerTrait(traitIdPro);
      var traitIndexAnti = traitService.registerTrait(traitIdAnti);
      traitService.setAntiId(traitIdPro, traitIdAnti);
      traitService.setEnabled(traitIdPro, true);
      traitService.setName(traitIdPro, tagArray[i].tag);
      traitService.setName(traitIdAnti, tagArray[i].tag + ".anti");

      // create and add bayes listener if needed
      if (!bayesListener)
        bayesListeners[tagKey] = new _DbBayesListener(tagKey);

      // setup inherited property management
      _inheritedProperties[tagKey] = new _inheritedPropertyObject(tagKey);
      InheritedPropertiesGrid.addPropertyObject(_inheritedProperties[tagKey]);
    }
    else
    {
      // if registered, disable
      if (traitService.isRegistered(traitIdPro))
        traitService.setEnabled(traitIdPro, false);
      if (bayesListeners[tagKey])
        delete bayesListeners[tagKey];
      if (_inheritedProperties[tagKey])
        delete _inheritedProperties[tagKey];
    }
  }
  // Add DB listeners to find changes in tagging
  taquilla.manageDbListeners(true);

  // setup columns on all active message windows
  for (let index = 0; index < _windows.length; index++) {
    // let's just see if it exists
    let lWindow = _windows[index];
    lWindow.taquillaOverlay.setupColumns();
  }

}

function _inheritedPropertyObject(aTagKey)
{
  this._tagKey = aTagKey;
  this.property = "dobayes." + traitIdBase + aTagKey + ".pro";
  this.defaultValue = function defaultValue(aFolder) { return false; };
  this.name = taquillaStrings.formatStringFromName("SoftTag",
                                [tagService.getTagForKey(aTagKey)], 1);
  this.accesskey = tagService.getTagForKey(aTagKey).charAt(0);
  this.hidefor = "none,pop3,nntp,rss,imap"; // This is disabled in the account manager because of bug 525024
};

/**
 * Listener management. We use database listeners, enabled using the pending listener
 * method. There is no easy was to control the removing of these listeners if they
 * are shared over multiple folders. We could just create one per feature and per folder,
 * but instead we will maintain a single set of listeners, applied to all folders in the system,
 * and make sure that any folders get our listeners.
 */

// an empty nsIDbChangeListener
function _DbListener()
{
  this.onHdrFlagsChanged = function onHdrFlagsChanged(aHdrChanged, aOldFlags, aNewFlags, aInstigator) {};
  this.onHdrDeleted = function onHdrDeleted(aHdrChanged, aParentKey, aFlags, aInstigator) {};
  this.onHdrAdded = function onHdrAdded(aHdrChanged, aParentKey, aFlags, aInstigator) {};
  this.onParentChanged = function onParentChanged(aKeyChanged, oldParent, newParent, aInstigator) {};
  this.onAnnouncerGoingAway = function onAnnouncerGoingAway(aInstigator)
  {
    aInstigator.RemoveListener(this);
  };
  this.onReadChanged = function onReadChanged(aInstigator) {};
  this.onJunkScoreChanged = function onJunkScoreChanged(aInstigator) {};
  this.onHdrPropertyChanged = function onHdrPropertyChanged(aHdrToChange, aPreChange, aStatus, aInstigator) {};
  this.onEvent = function onEvent(aDB, aEvent) {};
}

_DbBayesListener = function _DbBayesListener(aKeyword)
{
  this.keyword = aKeyword;
  // cached values for performance
  this.tagId = traitIdBase + aKeyword + ".pro";
  this.bayesProp = bayesIdBase + aKeyword + ".pro";
  this.inheritedProp = "dobayes." + this.tagId;
  this.sourceProp = traitIdBase + aKeyword;
}

_DbBayesListener.prototype = new _DbListener();

_DbBayesListener.prototype.onHdrPropertyChanged =
  function(aHdrToChange, aPreChange, aStatus, aInstigator)
{
  let percent = parseInt(aHdrToChange.getStringProperty(this.bayesProp));
  /*
   * when a bayes percent is set, we'll use that to soft tag
   */
  if (aPreChange)
  {
    aStatus.value = percent;
    return;
  }

  if (percent == aStatus.value)
    return;  // nothing changed

  /*
   * By existing, we can assume that the relevant trait is enabled
   * for soft tagging. But we could be disabled on a per-folder
   * basis. If so, do nothing.
   */
  if (aHdrToChange.folder
                  .getInheritedStringProperty(this.inheritedProp)
                     != "true")
    return;

  // we add 1000 to the value when we actually evalute it, so that we
  // know to reapply the tagging. This is so that users can change the
  // setpoint and see a change.

  let realPercent = percent % 1000;
  // and we reset the hdr without using a db listener, since we *are* the listener
  aHdrToChange.setStringProperty(this.bayesProp, realPercent);

  let tagSource = aHdrToChange.getProperty(this.sourceProp);
  if (tagSource == "hard") // The user set the tag
    return;
  let isTagged = realPercent > taquilla._percents[this.keyword] ? true : false;
  let msgKeyArray = aHdrToChange.getStringProperty("keywords").split(" ");
  let wasTagged = (msgKeyArray.indexOf(this.keyword) >= 0);
  if ( (isTagged && wasTagged) || (!isTagged && !wasTagged))
  {
    /*
     * We don't need to change the tag. But we did just evaluate this
     * statistically, so we know more than we did before. Indicate this
     * by setting the source to soft. Should this use the db to make sure
     * that listeners are called?
     */
    aHdrToChange.setProperty(this.sourceProp, "soft");
    return; // no change
  }
  // It would be cool if we could figure out how to batch this for IMAP
  let messages = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);
  messages.appendElement(aHdrToChange, false);
  aHdrToChange.setProperty(this.sourceProp, "presoft");
  if (isTagged && !wasTagged)
  {
    aHdrToChange.folder.addKeywordsToMessages(messages, this.keyword);
  }
  else
  {
    aHdrToChange.folder.removeKeywordsFromMessages(messages, this.keyword);
  }
}

var bayesListeners = {};

/**
 * Keyword listener. The point of this is to listen for changes
 * to the keyword, done by users or filters or whatever. If the keyword
 * has changed, and we are doing soft tagging for that message, then
 * set the keyword change source property accordingly.
 */

_dbKeywordListener = new _DbListener();

_dbKeywordListener.onHdrPropertyChanged = function(aHdrToChange, aPreChange, aStatus, aInstigator)
{
  /*
   * We want to train the trait on changes, including removing any
   * previous training.
   */
  // check if enabled taquilla soft tags are set
  //  aStatus will track whether enabled softtags are set. We are limited to 32 by the size of an integer
  if (aPreChange)
    aStatus.value = 0;
  let aProIndices = {};
  let aAntiIndices = {};
  // consider caching this value, since we are also the only ones adding
  // traits that we care about.
  traitService.getEnabledIndices({}, aProIndices, aAntiIndices);
  let msgKeyArray = aHdrToChange.getStringProperty("keywords").split(" ");

  let mask = 1;
  for (let i = 0;
       i < aProIndices.value.length;
       i++, mask *= 2)
  {
    let proId = traitService.getId(aProIndices.value[i]);
    // for each enabled trait, note if the keyword exists
    if (proId.indexOf(traitIdBase) < 0)
      continue; // the trait is not a taquilla tag
    // pull out the tag key from the full proId. Form is:
    // taquilla@mesquilla.com.$label3.pro and we want $label3
    let keyword = proId.substr(traitIdBase.length, proId.length - traitIdBase.length - 4);
    let hasKeyword = (msgKeyArray.indexOf(keyword) >= 0);
    if (aPreChange)
    {
      if (hasKeyword)
        aStatus.value |= mask;
    }

    else // post change
    {
      // on post change, if a keyword is newly set, we train
      if ( !((hasKeyword && !(mask & aStatus.value)) ||
             (!hasKeyword && (mask & aStatus.value))) )
      {
        continue; // nothing changed
      }

      // keyword changed between pre and post call

      // do nothing if soft tag is disabled for this folder
      if (aHdrToChange.folder
                      .getInheritedStringProperty("dobayes." + traitIdBase + keyword + ".pro")
                         != "true")
        continue;

      /* tagsource is used to communicate types of changes. Possible values are:
       *   (blank): application did a hard set for first time
       *   presoft: current change by bayesian filter
       *   hard:    application did a hard set, and we trained on it
       *   soft:    bayes filter previously set (current change is by app)
       */
      let tagSource = aHdrToChange.getProperty(traitIdBase + keyword);

      if (tagSource == "presoft")
      {
        // don't train if we soft set the tag
        aHdrToChange.setProperty(traitIdBase + keyword, "soft");
        continue;
      }
      let oldTraits = [];
      if (tagSource == "hard")
      {
        // need to untrain previous trait
        if (hasKeyword)
          oldTraits.push(aAntiIndices.value[i]);
        else
          oldTraits.push(aProIndices.value[i]);
      }
      let newTraits = [];
      if (hasKeyword)
        newTraits.push(aProIndices.value[i]);
      else
        newTraits.push(aAntiIndices.value[i]);
      aHdrToChange.setProperty(traitIdBase + keyword, "hard");
      nsIJunkMailPlugin.setMsgTraitClassification(
        aHdrToChange.folder.generateMessageURI(aHdrToChange.messageKey),
        oldTraits.length,  // length of aOldTraits array
        oldTraits,         // in array aOldTraits
        1,                 // length of aNewTraits array
        newTraits);        // in array aNewTraits
    }
  }
}

// Train a given header with the keyword if appropriate
//   @parm aHdr       nsIMsgDBHdr object for the message
//   @parm aKeyword   keyword to train
//   @parm aNew       true if message should have this keyword
//   @parm aOld       true if message previously had this keyword
taquilla.trainIfNeeded = function trainIfNeeded(aHdr, aKeyword, aNew, aOld)
{
  let traitProperty = traitIdBase + aKeyword;
  let traitProId = traitProperty + ".pro";
  let traitAntiId = traitProperty + ".anti";

  // do nothing if soft tag is disabled for this folder
  if (aHdr.folder
          .getInheritedStringProperty("dobayes." + traitProId)
                     != "true")
    return;

  /* tagsource is used to communicate types of changes. Possible values are:
   *   (blank): application did a hard set for first time
   *   presoft: current change by bayesian filter
   *   hard:    application did a hard set, and we trained on it
   *   soft:    bayes filter previously set (current change is by app)
   */
  let tagSource = aHdr.getProperty(traitProperty);

  if (tagSource == "presoft")
  {
    // don't train if we just soft set the tag
    aHdr.setProperty(traitProperty, "soft");
    return;
  }

  // convert the trait id into a trait index
  let traitProIndex;
  let traitAntiIndex;
  try {
    traitProIndex = traitService.getIndex(traitProId);
    traitAntiIndex = traitService.getIndex(traitAntiId);
  } catch (e) {return;} // error means traits not registered

  let oldTraits = [];
  if (tagSource == "hard")
  {
    if (aNew == aOld) // previously trained correctly
      return;
    // need to untrain previous trait
    if (aNew)
      oldTraits.push(traitAntiIndex);
    else
      oldTraits.push(traitProIndex);
  }

  let newTraits = [];
  if (aNew)
    newTraits.push(traitProIndex);
  else
    newTraits.push(traitAntiIndex);

  aHdr.setProperty(traitProperty, "hard");
  nsIJunkMailPlugin.setMsgTraitClassification(
    aHdr.folder.generateMessageURI(aHdr.messageKey),
    oldTraits.length,  // length of aOldTraits array (may be zero or one)
    oldTraits,         // in array aOldTraits
    1,                 // length of aNewTraits array
    newTraits);        // in array aNewTraits
}

taquilla.manageDbListeners = function manageDbListeners(aIsAdd)
{
  var servers = accountManager.allServers;

  for each (var server in fixIterator(servers, Ci.nsIMsgIncomingServer))
  {
    var rootFolder = server.rootFolder;
    if ("ListDescendents" in rootFolder) // TB 17
    {
      var allFolders = Cc["@mozilla.org/supports-array;1"]
                         .createInstance(Ci.nsISupportsArray);
      rootFolder.ListDescendents(allFolders);
    }
    else // TB 24
    {
      var allFolders = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);
      rootFolder.ListDescendants(allFolders);
    }
    for each (var folder in fixIterator(allFolders, Ci.nsIMsgFolder))
    {
      if (!_filterFolderForTraits(folder))
        continue;

      if (aIsAdd)
      {
        _addDbListeners(folder);
      }
      else
      {
        for each (var listener in bayesListeners)
        {
          try {
            dbService.unregisterPendingListener(listener);
          }
          catch (e) {} // error is normal if not already registered
        }
        try {
          dbService.unregisterPendingListener(_dbKeywordListener);
        }
        catch (e) {} // error is normal if not already registered
      }
    }
  }
  // listen for new folders, so we can add DB listeners
  if (aIsAdd)
    gMFNService.addListener(_folderListener, Ci.nsIMsgFolderNotificationService.folderAdded);
  else
    gMFNService.removeListener(_folderListener);

}

_folderListener =
{
  folderAdded: function (aFolder)
  {
    if (_filterFolderForTraits(aFolder))
      _addDbListeners(aFolder);
  }
}

// Should we listen to this folder for trait changes?
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

function _addDbListeners(aFolder)
{
  dbService.registerPendingListener(aFolder, _dbKeywordListener);
  for each (var listener in bayesListeners)
    dbService.registerPendingListener(aFolder, listener);
}

/**
 * TraitClassifier
 *
 * Helper object storing the list of pending messages to process,
 * and implementing trait processing callback
 *
 */

function TraitClassifier()
{
  var proArrayObject = {};
  var antiArrayObject = {};
  traitService.getEnabledIndices({}, proArrayObject, antiArrayObject);
  this.proTraits = [];
  this.antiTraits = [];
  // copy traits, skipping junk
  for (var i = 0; i < proArrayObject.value.length; i++)
  {
    var proIndex = proArrayObject.value[i];
    // do not analyze junk
    if (proIndex == nsIJunkMailPlugin.JUNK_TRAIT)
      continue;
    this.proTraits.push(proIndex);
    this.antiTraits.push(antiArrayObject.value[i]);
  }
  if (!this.proTraits.length)
    return; // nothing to do
  this.mMessages = new Object();
  this.mMessageQueue = new Array();
  this.firstMessage = true;
  this.lastStatusTime = Date.now();
}

TraitClassifier.prototype =
{
  /**
   * analyzeMessage
   *
   * Starts the message classification process for a message.
   *
   * @param aMsgHdr
   *        The header (nsIMsgDBHdr) of the message to classify.
   */
  analyzeMessage: function(aMsgHdr, aTotalMessages, aFeedback)
  {
    this.mTotalMessages = aTotalMessages;
    this.mFeedback = aFeedback;
    this.mProcessedMessages = 0;
    var messageURI = aMsgHdr.folder.generateMessageURI(aMsgHdr.messageKey) + "?fetchCompleteMessage=true";
    this.mMessages[messageURI] = aMsgHdr;
    if (this.firstMessage)
    {
      this.firstMessage = false;
      nsIJunkMailPlugin.classifyTraitsInMessage(messageURI, this.proTraits.length,
        this.proTraits, this.antiTraits, this);
    }
    else
      this.mMessageQueue.push(messageURI);
  },

  /*
   * nsIMsgTraitClassificationListener implementation
     void onMessageTraitsClassified(
       in string aMsgURI,
       in unsigned long aTraitCount,
       [array, size_is(aTraitCount)] in unsigned long aTraits,
       [array, size_is(aTraitCount)] in unsigned long aPercents)
   */
  onMessageTraitsClassified: function(aMsgURI, aTraitCount, aTraits, aPercents)
  {
    if (!aMsgURI)
      return // ignore batching
    var msgHdr = this.mMessages[aMsgURI];
    var db = msgHdr.folder.msgDatabase;
    const statusDisplayInterval = 1000; // milliseconds between status updates
    for (var i = 0; i < aTraitCount; i++)
    {
      traitId = traitService.getId(aTraits[i]);
      // we add 1000 to signify a change, removed in listener
      var taggedPercent = parseInt(aPercents[i]) + 1000;
      // We really want to force evaluation of this, so force a change
      msgHdr.setStringProperty("bayespercent/" + traitId, parseInt(aPercents[i]));
      db.setStringPropertyByHdr(msgHdr, "bayespercent/" + traitId, taggedPercent);

      // test of details
      //nsIJunkMailPlugin.detailMessage(aMsgURI, null, aTraits[i],
      //  traitService.getIndex(traitService.getAntiId(traitId)), this);
    }

    var nextMsgURI = this.mMessageQueue.shift();
    if (nextMsgURI)
    {
      ++this.mProcessedMessages;
      if (Date.now() > this.lastStatusTime + statusDisplayInterval)
      {
        this.lastStatusTime = Date.now();
        var percentDone = 0;
        if (this.mTotalMessages)
          percentDone = Math.round(this.mProcessedMessages * 100 / this.mTotalMessages);
        var percentStr = percentDone + "%";
        if (this.mFeedback)
          this.mFeedback.showStatusString(
              taquillaStrings.formatStringFromName("traitAnalysisPercentComplete",
                                                [percentStr], 1));

      }

      nsIJunkMailPlugin.classifyTraitsInMessage(nextMsgURI, this.proTraits.length,
        this.proTraits, this.antiTraits, this);
    }
    else
      this.mFeedback.showStatusString("");
  },

}

/*
 * classifyFolderForTraits
 *
 * Classify messages in the current folder for traits
 *
 * @param aAll: true to filter all messages, else filter selection
 * @param aDBView: nsIMsgDBView component (gDBView)
 * @param feedback: window.MsgStatusFeedback object
 */

taquilla.classifyFolderForTraits = function(aAll, aDBView, aFeedback)
{

  if (aAll)
  {
    // need to expand all threads, so we analyze everything
    aDBView.doCommand(Ci.nsMsgViewCommandType.expandAll);
    var treeView = aDBView.QueryInterface(Ci.nsITreeView);
    var count = treeView.rowCount;
    if (!count)
      return;
  }
  else
  {
    var indices = aDBView.getIndicesForSelection({});
    if (!indices || !indices.length)
      return;
  }
  var totalMessages = aAll ? count : indices.length;

  // create a classifier instance to classify messages in the folder.
  var msgClassifier = new TraitClassifier();

  for ( var i = 0; i < totalMessages; i++)
  {
    var index = aAll ? i : indices[i];
    try
    {
      var msgKey = aDBView.getKeyAt(index);
      var msgFolder = aDBView.getFolderForViewIndex(index);
      var msgHdr = msgFolder.GetMessageHeader(msgKey);
      msgClassifier.analyzeMessage(msgHdr, totalMessages, aFeedback);
    }
    catch (ex)
    {
      // blow off errors here - dummy headers will fail
    }
  }
}

taquilla.initMessageTags = function(menuPopup, dbView, window)
{
  let tagService = Cc["@mozilla.org/messenger/tagservice;1"]
                     .getService(Ci.nsIMsgTagService);
  let tagArray = tagService.getAllTags({});
  let document = window.document;
  let strbundle = document.getElementById("taquilla-strings");
  let strDetails = strbundle.getString("details") + " ";

  let menupopup = document.getElementById("mpContextDetailsPopup-taquilla");
  let menuseparator = document.getElementById("mpClassify-taquilla-sep");
  // remove any existing non-static entries
  let item;
  while (item = menuseparator.nextSibling)
    menupopup.removeChild(item);

  for (var i = 0; i < tagArray.length; i++)
  {
    let tagInfo = tagArray[i];
    let isSoft = false;
    try {
      isSoft = prefs.getBoolPref(tagInfo.key + ".isSoft");
    }
    catch(e) {}
    if (isSoft)
    {
      let tagMenuitem = document.createElement("menuitem");
      tagMenuitem.setAttribute("label", strDetails + tagInfo.tag);
      tagMenuitem.setAttribute("oncommand", "taquilla.detailWindowOpen(gDBView, window, '" + tagInfo.key + "')");
      menupopup.appendChild(tagMenuitem);
    }
  }
}

taquilla.detailWindowOpen = function(aDBView, window, tagKey)
{
  let args = {};
  args.proIndex = traitService.getIndex(traitIdBase + tagKey + ".pro");
  args.antiIndex = traitService.getIndex(traitIdBase + tagKey + ".anti");
  args.hdr = aDBView.hdrForFirstSelectedMessage;
  args.title = taquillaStrings.GetStringFromName("detailTitle");

  taquilla._detailWindow = window.openDialog("chrome://taquilla/content/detail.xul", "_blank",
      "chrome,extrachrome,menubar,resizable=yes,scrollbars=yes,status=yes", args);
};
