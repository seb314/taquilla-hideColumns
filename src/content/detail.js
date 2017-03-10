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

  // global scope variables
  this.mesquillaDetail = {};

  // local shorthand for the global reference
  var that = this.mesquillaDetail;

  that.initialized = false;
  
  const nsIJunkMailPlugin = Cc["@mozilla.org/messenger/filter-plugin;1?name=bayesianfilter"]
                            .getService(Ci.nsIJunkMailPlugin);
  
  that.onLoad = function(e)
  {
    //dump("\ndetail.OnLoad");
    let labelSubject = document.getElementById("mesquillaDetailMessage");
    let args = window.arguments[0];
    let hdr = args.hdr;
    let proIndex = args.proIndex;
    let antiIndex = args.antiIndex;
    labelSubject.setAttribute("value", hdr.mime2DecodedSubject);
    let dialog = document.getElementById("mesquillaDetail");
    dialog.setAttribute("title", args.title);
    var messageURI = hdr.folder.generateMessageURI(hdr.messageKey) + "?fetchCompleteMessage=true";
    nsIJunkMailPlugin.detailMessage(messageURI, proIndex,
                                    antiIndex, _detailListener);
  };

  that.onUnload = function(e)
  {
  };

  let _detailListener = 
  {
    onMessageTraitDetails: function(aMsgURI, aProTrait, aTokenCount,
      aTokenStrings, aTokenPercents, aRunningPercents)
    {
      //dump("\nonMessageTraitDetails aTokenCount is " + aTokenCount);
      // add the data to the detail tree
      var detailChildren = document.getElementById("mesquillaDetailChildren");
      for (var i = 0; i < aTokenCount; i++)
      {
        let treeItem = document.createElement("treeitem");
        let treeRow = document.createElement("treerow");
        detailChildren.appendChild(treeItem);
        treeItem.appendChild(treeRow);
        let stringCell = document.createElement("treecell");
        let tokenCell = document.createElement("treecell");
        let runningCell = document.createElement("treecell");
        stringCell.setAttribute("label", aTokenStrings[i]);
        tokenCell.setAttribute("label", aTokenPercents[i]);
        runningCell.setAttribute("label", aRunningPercents[i]);
        treeRow.appendChild(stringCell);
        treeRow.appendChild(tokenCell);
        treeRow.appendChild(runningCell);
      }
    }
  };

})();
