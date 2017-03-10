/*
 ***** BEGIN LICENSE BLOCK *****
 * This file is part of the application taquilla by Mesquilla.
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

 // folder properties overlay. Unfortunately there are not adequate ids in the
 // filter properties xul to make a normal overlay possible, so instead we have
 // to add our xul dynamically.

Components.utils.import("resource://taquilla/inheritedPropertiesGrid.jsm");
 
(function()
{
  // global scope variables
  this.taquillaFolderProps = {};

  // local shorthand for the global reference
  let self = this.taquillaFolderProps;

  // module-level variables
  const Cc = Components.classes;
  const Ci = Components.interfaces;
  const Cu = Components.utils;
  const traitIdBase = "taquilla@mesquilla.com#tag.";

  Cu.import("resource://taquilla/taquilla.jsm");
  let folder; // nsIMsgFolder passed to the window

  self.onLoad = function onLoad(e)
  { try {
    folder = window.arguments[0].folder;

    window.gInheritTarget = folder;

    // create or get the rows from the inherit grid
    let rows = InheritedPropertiesGrid.getInheritRows(document);
    let softTags = taquilla.getSofttagKeys();
    for (let tagIndex = 0; tagIndex < softTags.length; tagIndex++)
    {
      let property = "dobayes." + traitIdBase + softTags[tagIndex] + ".pro";
      let row = InheritedPropertiesGrid.createInheritRow(property, folder, document);
      rows.appendChild(row);
    }
    // extend the ondialogaccept attribute
    let dialog = document.getElementsByTagName("dialog")[0];
    dialog.setAttribute("ondialogaccept", "taquillaFolderProps.onAcceptInherit();" + 
                        dialog.getAttribute("ondialogaccept"));
  } catch (e) {Cu.reportError(e);}};

  self.onAcceptInherit = function taquillaOnAcceptInherit()
  { try {
    let softTags = taquilla.getSofttagKeys();
    for (let tagIndex = 0; tagIndex < softTags.length; tagIndex++)
    {
      let property = "dobayes." + traitIdBase + softTags[tagIndex] + ".pro";
      InheritedPropertiesGrid.onAcceptInherit(property, folder, document);
    }
  } catch (e) {Cu.reportError(e);}};

})();

window.addEventListener("load", function(e) { taquillaFolderProps.onLoad(e); }, false);
