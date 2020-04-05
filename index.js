debugger;
const errorLogPath = generateErrorFileName(modulePath);

ngapp.run(function(patcherService) {
	patcherService.registerPatcher({
					info: info,
					gameModes: [xelib.gmSSE, xelib.gmTES5],
					settings:
						{

							label: 'EBD Extender',
							templateUrl: `${moduleUrl}/partials/settings.html`,
							controller: function($scope)
							{
								let patcherSettings = $scope.settings.id_EBDExtenderPatcher;  //$scope.anything becomes available as "anything" in the html file

								let path_raceGroupDefs = modulePath + "\\EBDE Assets\\RestrictionDefs";
								patcherSettings.raceGroupDefinitions = loadRestrictionGroupDefs(path_raceGroupDefs, fh, patcherSettings);
								let path_AssetPackSettings = modulePath + "\\EBDE Assets\\ResourcePackSettings";
								patcherSettings.assetPackSettings = loadAssetPackSettings(path_AssetPackSettings, path_raceGroupDefs, fh, patcherSettings);

								let permutations = generateAssetPackPermutations(patcherSettings.assetPackSettings)

								$scope.genderOptions = ["male", "female"];

								$scope.addSubgroupTop = function(index) {
									patcherSettings.assetPackSettings[index].subgroups.push({
										id: 'defaultId',
										enabled: false,
										allowedRaces: [],
										disallowedRaces: [],
										allowedAttributes: [],
										disallowedAttributes: [],
										name: 'Default Name',
										requireSubgroups: [],
										excludeSubgroups: [],
										paths: [],
										subgroups: []
									});
								}

								$scope.saveAssetPackSettings = function(currentPackSettings)
								{
									if (currentPackSettings.sourcePath == undefined)
									{
										currentPackSettings.sourcePath = path_AssetPackSettings + "\\" + currentPackSettings.groupName + ".json";
									}

									try
									{
										fh.saveJsonFile(currentPackSettings.sourcePath, currentPackSettings);
										alert("Saved: "+ currentPackSettings.sourcePath);
									}

									catch (e) {
										alert("Settings file could not be saved. If this is a new file, make sure that the Group Name contains valid filename characters.")
									}

								}

								$scope.newAssetPackSettings = function()
								{
									let newSettings = {};
									newSettings.groupName = "DEFAULT";
									newSettings.gender = "female";
									newSettings.displayAlerts = true;
									newSettings.userAlert = "";
									newSettings.subgroups = [];
									patcherSettings.assetPackSettings.push(newSettings);
								}

							},

							defaultSettings:
								{
									changeHeight: false,
									changeHeadparts: false,
									changeTextures: true,
									changeMeshes: true,
									changeNPCsWithWNAM: true,
									editHeadPartTextures: true,
									changeFemaleAnimations: false,
									enableConsistency: true,
									displayAssetPackAlerts: true,
									resourcePackSettingsArray: [],
									patchFileName: 'EBDextender.esp'
								}
						},
					// optional array of required filenames.  can omit if empty.
					requiredFiles: [],
					getFilesToPatch: function(filenames)
					{
						let gameName = xelib.GetGlobal('GameName');
						return filenames.subtract([`${gameName}.esm`]);
						//return filenames;
					},
					execute: (patchFile, helpers, settings, locals) =>
						(
							{
								initialize: function()
								{
									locals.weapons = helpers.loadRecords('WEAP');
								},
								process:
									[
										{
											load:
												{
													signature: 'ARMO',
													filter: function(record)
													{
														// return false to filter out (ignore) a particular record
														return parseFloat(xelib.GetValue(record, 'DNAM')) > 20;
													}
												},
											patch: function(record)
											{
												// change values on the record as required
												// you can also remove the record here, but it is discouraged.
												// (try to use filters instead.)
												helpers.logMessage(`Patching ${xelib.LongName(record)}`);
												xelib.SetValue(record, 'DNAM', '30');
											}
										},
										{
											// loads all REFRs that place Weapons
											records: filesToPatch =>
											{
												let records = filesToPatch.map
												(
													f =>
													{
														return xelib.GetREFRs(f, 'WEAP');
													}
												);
												return Array.prototype.concat.apply([], records);
											},
											// patches REFRs that place weapons to be initially disabled
											patch: function(record)
											{
												xelib.SetFlag(record, 'Record Header\\Record Flags', 'Initially Disabled', true);
											}
										}
									],
								finalize: function()
								{
									helpers.logMessage(`Found ${locals.weapons.length} cached weapons records.`);
									// this creates a new record at the same form ID each time the patch
									// is rebuilt so it doesn't get lost when the user rebuilds a patch
									// plugin and loads a save
									let weapon  = xelib.AddElement(patchFile, 'WEAP\\WEAP');
									helpers.cacheRecord(weapon, 'MEPz_BlankWeapon');
									xelib.AddElementValue(weapon, 'FULL', 'Blank Weapon');

								}
							}
						)



});
});

function loadRestrictionGroupDefs(path_restrictionDir, fh, patcherSettings)
{
	let bParsedSuccessfully = true;
	let restrictionArray = [];
	let fs = require('fs');
	let files = fs.readdirSync(path_restrictionDir);

	let currentRestrictionGroupSettings = undefined;

	for (let i = 0; i < files.length; i++)
	{
		if (files[i].split('.').pop().toLowerCase() == "json")
		{
			try {
				currentRestrictionGroupSettings = fh.loadJsonFile(path_restrictionDir + "\\" + files[i]);
			}

			catch (e) { bParsedSuccessfully = false;
				logError("Race Group Definition Settings loading", "File " + files[i] + " could not be parsed. Check your JSON formatting.", fh)
				continue;
			}

			let bParsedSuccssfully = validateGroupDefinitionSettings(currentRestrictionGroupSettings, fh, patcherSettings, files[i], bParsedSuccessfully);
			if (bParsedSuccssfully === true)
			{
				copyArrayInto(currentRestrictionGroupSettings, restrictionArray);
			} // don't push or each json file will become its own array
			else
			{
				alertError("An error occured during Race Group Definition Settings interpretation.");
			}

		}
	}

	if (bParsedSuccessfully == false)
	{
		alertError("An error occured during Race Group Definition Settings loading.");
	}

	return restrictionArray;
}

function validateGroupDefinitionSettings(currentRestrictionGroupSettings, fh, patcherSettings, fileName, bParsedSuccessfully)
{
	let groupName = "";

	if (Array.isArray(currentRestrictionGroupSettings) == false)
	{
		logError("Interpretation of Race Group Definition settings (unnamed) in file " + fileName, "JSON files containing restriction groups must be arrays. Please see the GroupDefs.json file distributed with this patcher for an example", fh);
		return  true;
	}

	if (currentRestrictionGroupSettings.length > 0)
	{
		for (let i = 0; i < currentRestrictionGroupSettings.length; i++) {
			if (currentRestrictionGroupSettings[i].name == undefined || currentRestrictionGroupSettings[i].name.length == 0) {
				bParsedSuccessfully = false;
				logError("Interpretation of Race Group Definition settings (unnamed) in file " + fileName, "The \"name\" field must be set so that this group has a name", fh);
			} else {
				groupName = currentRestrictionGroupSettings[i].name;
			}

			if (currentRestrictionGroupSettings[i].entries == undefined)
			{
				bParsedSuccessfully = false;
				logError("Interpretation of Race Group Definition settings (" + groupName + ") in file " + fileName, "The group must have an \"entrires\" field populated by an array of RNAM records", fh);
			}
			else if (Array.isArray(currentRestrictionGroupSettings[i].entries) == false)
			{
				bParsedSuccessfully = false;
				logError("Interpretation of Race Group Definition settings (" + groupName + ") in file " + fileName, "The group must have an \"entrires\" field populated by an array of RNAM records", fh);
			}
		}
	}

	return bParsedSuccessfully;
}

function loadAssetPackSettings(path_packSettingsDir, raceGroupDefs, fh, patcherSettings)
{
	let packSettingsArray = [];
	let fs = require('fs');
	let files = fs.readdirSync(path_packSettingsDir);
	let bParsedSuccssfully = true;
	let currentPackSettings = undefined;

	for (let i = 0; i < files.length; i++)
	{
		if (files[i].split('.').pop().toLowerCase() == "json")
		{
			try {
				currentPackSettings = fh.loadJsonFile(path_packSettingsDir + "\\" + files[i]);
			}

			catch (e) { bParsedSuccssfully = false;
				logError("Asset Pack Settings loading", "File " + files[i] + " could not be parsed. Check your JSON formatting.", fh)
				continue;
			}

			bParsedSuccssfully = validatePackSettings(currentPackSettings, fh, patcherSettings, bParsedSuccssfully);

			if (bParsedSuccssfully === true)
			{
				currentPackSettings.sourcePath = path_packSettingsDir + "\\" + files[i];
				packSettingsArray.push(currentPackSettings);
			}
		}
	}

	if (bParsedSuccssfully == false)
	{
		alertError("An error occured during Asset Pack Settings loading.");
	}

	return packSettingsArray;
}


function validatePackSettings(currentPackSettings, fh, patcherSettings, bParsedSuccessfully)
{
	// check that currentPackSettings loaded from JSON file has all expected members. Warn users otherwise.

	let packSettingsName = "Package Settings Name was not defined."

	// check for group name
	if (currentPackSettings.groupName == undefined)
	{
		bParsedSuccessfully = false;
		logError("Interpretation of package settings " + packSettingsName, "The \"groupName\" field must be set so that this settings pack has a name", fh);
	}
	else { packSettingsName = currentPackSettings.groupName;}

	// check for gender
	if (currentPackSettings.gender == undefined)
	{
		bParsedSuccessfully = false;
		logError("Interpretation of package settings " + packSettingsName, "Pack must have a gender (M/m/F/f) assigned to it.", fh);
	}
	else
	{
		let gender = currentPackSettings.gender.toLowerCase();
		if (gender != "m" && gender != "f" && gender != "male" && gender != "female")
		{
			bParsedSuccessfully = false;
			logError("Interpretation of package settings " + packSettingsName, "Gender must be \"M\" or \"F\"", fh);
		}
	}

	// check for alerts
	if (currentPackSettings.displayAlerts == undefined)
	{
		currentPackSettings.displayAlerts = true;
	}
	if (currentPackSettings.displayAlerts == true && currentPackSettings.userAlert != undefined && currentPackSettings.userAlert.length > 0 && patcherSettings.displayAssetPackAlerts == true)
	{
		alert("Alert from " + packSettingsName + ":\n" + currentPackSettings.userAlert);
	}

	// validate subgroups
	if (currentPackSettings.subgroups == undefined)
	{
		bParsedSuccessfully = false;
		logError("Interpretation of package settings " + packSettingsName, "Package settings must have at least one subgroup defined, or have an empty array", fh);
	}
	else
	{
		for (let i = 0; i < currentPackSettings.subgroups.length; i++)
		{
			bParsedSuccessfully = validatesubgroupSettings(currentPackSettings.subgroups[i], fh, bParsedSuccessfully, packSettingsName);
		}
	}

	// ADD CODE TO VALIDATE OVERRIDE Groups

	return bParsedSuccessfully;
}

function validatesubgroupSettings(currentsubgroup, fh, bParsedSuccessfully, packSettingsName)
{
	const fs = require('fs');
	let tmp_path = "";
	//validate id
	if (currentsubgroup.id == undefined || currentsubgroup.id.trim() == "")
	{
		bParsedSuccessfully = false;
		logError("Interpretation of package settings " + packSettingsName, "Each subgroup must have an \"id\"", fh);
	}

	// validate enabled (set to enabled if left undefined)
	if (currentsubgroup.enabled == undefined) { currentsubgroup.enabled = true; }

	// validate allowedRaces (set to [] if undefined)
	if (currentsubgroup.allowedRaces == undefined) { currentsubgroup.allowedRaces = []; }

	// validate dispaths (set to [] if undefined)
	if (currentsubgroup.disallowedRaces == undefined) { currentsubgroup.disallowedRaces = []; }

	// validate allowedAtributes (set to [] if undefined)
	if (currentsubgroup.allowedAttributes == undefined) { currentsubgroup.allowedAttributes = []; }
	// make sure they are pairs
	else if (currentsubgroup.allowedAttributes.length > 0)
	{
		for (let i = 0; i < currentsubgroup.allowedAttributes.length; i++)
		{
			if (currentsubgroup.allowedAttributes[i].length != 2)
			{
				bParsedSuccessfully = false;
				logError("Interpretation of package settings " + packSettingsName, "allowedAttributes must be an array of arrays of length 2, such as [\"VTCK\", \"MaleYoungEager\"]", fh);
			}
		}
	}

	// validate disallowedAttributes (set to [] if undefined)
	if (currentsubgroup.disallowedAttributes == undefined) { currentsubgroup.disallowedAttributes = []; }
	// make sure they are pairs
	else if (currentsubgroup.disallowedAttributes.length > 0)
	{
		for (let i = 0; i < currentsubgroup.disallowedAttributes.length; i++)
		{
			if (currentsubgroup.disallowedAttributes[i].length != 2)
			{
				bParsedSuccessfully = false;
				logError("Interpretation of package settings " + packSettingsName, "disallowedAttributes must be an array of arrays of length 2, such as [\"VTCK\", \"MaleYoungEager\"]", fh);
			}
		}
	}

	// validate requiresubgroups (set to [] if undefined)
	if (currentsubgroup.requireSubgroups == undefined) { currentsubgroup.requireSubgroups = []; }

	// validate excludesubgroups (set to [] if undefined)
	if (currentsubgroup.excludeSubgroups == undefined) { currentsubgroup.excludeSubgroups = []; }

	// validate paths (set to [] if undefined)
	if (currentsubgroup.paths == undefined) { currentsubgroup.paths = []; }
	else if (currentsubgroup.paths.length > 0)
	{
		for (let i = 0; i < currentsubgroup.paths.length; i++)
		{
			tmp_path = xelib.GetGlobal('DataPath') + currentsubgroup.paths[i];
			//if (fs.existsSync(tmp_path) == false)
			if (fh.loadTextFile(xelib.GetGlobal('DataPath') + currentsubgroup.paths[i], -1) === -1)
			{
				bParsedSuccessfully = false;
				logError("Interpretation of package settings " + packSettingsName, "File " + tmp_path + " was not found", fh);
			}
		}
	}

	// validate subgroups (set to [] if undefined)
	if (currentsubgroup.subgroups == undefined) { currentsubgroup.subgroups = []; }

	// move on to next subgroup layer if necessary
	for (let i = 0; i < currentsubgroup.subgroups.length; i++)
	{
		bParsedSuccessfully = validatesubgroupSettings(currentsubgroup.subgroups[i], fh, bParsedSuccessfully, currentsubgroup.id);
	}
	return bParsedSuccessfully
}

function generateErrorFileName(modulePath)
{
	let currentDate = new Date(); // initialized with current timestamp
	let dateString = currentDate.toUTCString();
	dateString = dateString.replace(new RegExp(':', 'g'), '-');
	//return modulePath + "\\test.txt";
	return modulePath + "\\EBDEerrors_" + dateString + ".txt";
}

function logError(errorOccurredDuring, errorToLog, fh)
{
	let errorFileExists = false;
	let toWrite = "";
	const fs = require('fs')
	try {
		if (fs.existsSync(errorLogPath))
		{
			toWrite = fh.loadTextFile(errorLogPath);
		}
	}
	catch (e) {
		alert("Error: could not read error log file at " + errorLogPath);
	}

	if (errorToLog != "") {
		toWrite += "An error occured during " + errorOccurredDuring + "\n";
		toWrite += "Details: \n" + errorToLog + "\n";

		try {
			fh.saveTextFile(errorLogPath, toWrite);
		} catch (e) {
			alert("Error: could not write error log file at " + errorLogPath);
		}
	}
}

function alertError(errorToDisplay)
{
	alert(errorToDisplay + "\nPlease check EBDEerrors.txt for details.");
}

function copyArrayInto(copyFrom, copyTo) // arrays edited by pointer - no return value
{
	for(let i = 0; i < copyFrom.length; i++)
	{
		copyTo.push(copyFrom[i]);
	}
}

function generateAssetPackPermutations(assetPackSettings)
{
	let permutations = [];
	let current_permutation = [];

	// get the subgroups at the bottom of each subgroup stack (e.g all possible branches of the subgroup tree). Copy the paths from non-terminal nodes into the terminal ones (because otherwise they're not returned).
	// ALSO COPY RESTRICTIONS - NOT YET IMPLEMENTED AND VERY IMPORTANT!
	for (let i = 0; i < assetPackSettings.length; i++)
	{
		for (let j = 0; j < assetPackSettings[i].subgroups.length; j++)
		{
			getBottomPermutationVariants(assetPackSettings[i].subgroups[j], current_permutation, new transferSubgroupInfo());
			permutations.push(current_permutation);
			current_permutation = [];
		}
	}

	// now permutations is an array containing n sub-arrays. n = number of top-level subgroups (to be combined together) and the array contains all sub-members of these top-level subgroups, which have been updated to carry their parent subrgoup.path strings (if any).

	// now generate a single array that contains all possible combinations of the n sub-arrays.
	let combinedPermArray = [];

	combinedPermArray = combineSubarrays(permutations, combinedPermArray);

	// get rid of disabled variants
	for (let i = 0; i < combinedPermArray.length; i++)
	{
		let disabled = false;
		for (let j = 0; j < combinedPermArray[i].length; j++)
		{
			if (combinedPermArray[i][j].enabled == false)
			{
				disabled = true;
				break;
			}
		}
		if (disabled == true)
		{
			combinedPermArray.splice(i, 1);
			i--;
		}
	}


	return combinedPermArray;
}

// this is a recursive function that combines n columns of m rows into the n*m possible permutations
// permutations is the input subgroups arranged into columns to be combined
// (ex [head1, head2], [body1, body2], [hands1, hands2]).
// the output from the example above is [[head1, body1, hands1], [head1, body1, hands2], [head1, body2, hands1], etc..]
function combineSubarrays(permutations)
{
	let combinationsFromThisLayer = []; // combinations from this layer of recursion.
	let tmpCombinations = [];
	// check if there are any variatns in this subarray
	if (permutations.length == 1) { return permutations[0]; } // if in the bottom layer, simply return the last array column

	// otherwise, split the current array into the first column and all other columns
	let firstColumn = permutations[0];
	// iterate through the first column ([head1, head2])

	// now creat a subArray of all other columns
	let otherColumns = permutations.slice(1); // slice function without a second parameter returns subarray from 1 to the end of the array).

	let concats = combineSubarrays(otherColumns); // recursively call this function to generate all permutation combinations from the columns to the right of this one.

	// now iterate through every subgroup in the first column and combine it with the recrusively-generated combinations (concats) from the other columns
	for (let i = 0; i < firstColumn.length; i++)
	{
		for (let j = 0; j < concats.length; j++)
		{
			tmpCombinations = [];
			tmpCombinations.push(firstColumn[i]); // add the current iteration of the first column
			if (otherColumns.length == 1)
			{
				copyArrayInto(new Array(concats[j]), tmpCombinations)
			}
			else
			{
				copyArrayInto(concats[j], tmpCombinations);
			}
			combinationsFromThisLayer.push(tmpCombinations); // add the combined array (first column + permutation from other columns) to the return array for this layer.
		}
	}

	return combinationsFromThisLayer;
}
//allowedRaces, disallowedRaces, allowedAttributes, disallowedAttributes, requiredSubgroups, excludedSubgroups, paths
function getBottomPermutationVariants(subgroup, permArray, parentSubgroupInfoArray)
{
	const clonedeep = require('lodash.clonedeep');

	let transferSubGroupInfofromCurrentLayer = new transferSubgroupInfo();
	// copy any existing restrictions and paths in the parent transferSubgroupInfo object from previous recursion into a new variable (to avoid contaminating the array for recursions that don't go down this branch)
	copyArrayInto(parentSubgroupInfoArray.allowedRaces, transferSubGroupInfofromCurrentLayer.allowedRaces);
	copyArrayInto(parentSubgroupInfoArray.disallowedRaces, transferSubGroupInfofromCurrentLayer.disallowedRaces);
	copyArrayInto(parentSubgroupInfoArray.allowedAttributes, transferSubGroupInfofromCurrentLayer.allowedAttributes);
	copyArrayInto(parentSubgroupInfoArray.disallowedAttributes, transferSubGroupInfofromCurrentLayer.disallowedAttributes);
	copyArrayInto(parentSubgroupInfoArray.requiredSubgroups, transferSubGroupInfofromCurrentLayer.requiredSubgroups);
	copyArrayInto(parentSubgroupInfoArray.excludedSubgroups, transferSubGroupInfofromCurrentLayer.excludedSubgroups);
	copyArrayInto(parentSubgroupInfoArray.paths, transferSubGroupInfofromCurrentLayer.paths);

	// if this is the not lowest subgroup (contains subgroups itself)
	if (subgroup.paths != undefined && subgroup.paths.length > 0) // copy the paths and restrictions from this subgroup, if any, into the transferSubgroupInfo object to pass down to the lowest level recursion
	{
		copyArrayInto(subgroup.allowedRaces, transferSubGroupInfofromCurrentLayer.allowedRaces);
		copyArrayInto(subgroup.disallowedRaces, transferSubGroupInfofromCurrentLayer.disallowedRaces);
		copyArrayInto(subgroup.allowedAttributes, transferSubGroupInfofromCurrentLayer.allowedAttributes);
		copyArrayInto(subgroup.disallowedAttributes, transferSubGroupInfofromCurrentLayer.disallowedAttributes);
		copyArrayInto(subgroup.requireSubgroups, transferSubGroupInfofromCurrentLayer.requiredSubgroups);
		copyArrayInto(subgroup.excludeSubgroups, transferSubGroupInfofromCurrentLayer.excludedSubgroups);
		copyArrayInto(subgroup.paths, transferSubGroupInfofromCurrentLayer.paths);
	}

	if (subgroup.subgroups == undefined || subgroup.subgroups.length == 0) // if there are no sublayers, return this sublayer with restrictions and path carried from upper layers
	{
		// deep clone the subgroup to avoid making changes to it. Directly editing subgroup result in changes that are carried back to the user's settings JSON file (effectively piling all of the upper-level paths and restrictions into the lowest level nodes)
		let sgClone = clonedeep(subgroup);

		copyArrayInto(parentSubgroupInfoArray.paths, sgClone.paths); // copy paths and restrictoins from upper level recursions into the sgClone to be returned
		copyArrayInto(parentSubgroupInfoArray.allowedRaces, sgClone.allowedRaces);
		copyArrayInto(parentSubgroupInfoArray.disallowedRaces, sgClone.disallowedRaces);
		copyArrayInto(parentSubgroupInfoArray.allowedAttributes, sgClone.allowedAttributes);
		copyArrayInto(parentSubgroupInfoArray.disallowedAttributes, sgClone.disallowedAttributes);
		copyArrayInto(parentSubgroupInfoArray.requiredSubgroups, sgClone.requireSubgroups);
		copyArrayInto(parentSubgroupInfoArray.excludedSubgroups, sgClone.excludeSubgroups);
		permArray.push(sgClone); // return this subgroup
	}
	else
	{
		for (let i = 0; i < subgroup.subgroups.length; i++)
		{
			getBottomPermutationVariants(subgroup.subgroups[i], permArray, transferSubGroupInfofromCurrentLayer);
		}
	}
}

function copySubgroupIntoNewSubgroup(input, output)
{

}


ngapp.directive('displaySubgroups', function() {
	return {
		restrict: 'E',
		scope: {
			data: '=',
		},
		templateUrl: `${moduleUrl}/partials/subGroupTemplateDirective.html`,
		controller: 'subgroupController'
	};
});

ngapp.controller('subgroupController', function($scope)
{
	/*
	$scope.addSubgroup = function() {
		$scope.data.push({
			id: 'defaultId',
			enabled: false,
			allowedRaces: [],
			disalledRaces: [],
			allowedAttributes: [],
			disallowedAttributes: [],
			name: 'Default Name',
			requireSubgroups: [],
			excludeSubgroups: [],
			paths: [],
			subgroups: []
		});
	}
	 */

	$scope.addSubgroup = function(index) {
		$scope.data[index].subgroups.push({
			id: 'defaultId',
			enabled: false,
			allowedRaces: [],
			disalledRaces: [],
			allowedAttributes: [],
			disallowedAttributes: [],
			name: 'Default Name',
			requireSubgroups: [],
			excludeSubgroups: [],
			paths: [],
			subgroups: []
		});
	}

	$scope.removeSubgroup = function(index)
	{
		$scope.data.splice(index, 1);
	}

	$scope.addAllowedRace = function (index) { $scope.data[index].allowedRaces.push(""); }
	$scope.removeAllowedRace = function(subgroupIndex, arrayIndex)
	{
		$scope.data[subgroupIndex].allowedRaces.splice(arrayIndex, 1);
	}

	$scope.addDisallowedRace = function (index) { $scope.data[index].disallowedRaces.push("");}
	$scope.removeDisallowedRace = function(subgroupIndex, arrayIndex) {$scope.data[subgroupIndex].disallowedRaces.splice(arrayIndex, 1);}

	$scope.addAllowedAttribute = function (index) { $scope.data[index].allowedAttributes.push(["",""]);}
	$scope.removeAllowedAttribute = function(subgroupIndex, arrayIndex) {$scope.data[subgroupIndex].allowedAttributes.splice(arrayIndex, 1);}

	$scope.addDisallowedAttribute = function (index) { $scope.data[index].disallowedAttributes.push(["",""]);}
	$scope.removeDisallowedAttribute = function(subgroupIndex, arrayIndex) {$scope.data[subgroupIndex].disallowedAttributes.splice(arrayIndex, 1);}

	$scope.addRequireSubgroup = function (index) { $scope.data[index].requireSubgroups.push("");}
	$scope.removeRequireSubgroup = function(subgroupIndex, arrayIndex) {$scope.data[subgroupIndex].requireSubgroups.splice(arrayIndex, 1);}

	$scope.addExcludeSubgroup = function (index) { $scope.data[index].excludeSubgroups.push("");}
	$scope.removeExcludeSubgroup = function(subgroupIndex, arrayIndex) {$scope.data[subgroupIndex].excludeSubgroups.splice(arrayIndex, 1);}

	$scope.addPath = function (index) { $scope.data[index].paths.push("");}
	$scope.removePath = function(subgroupIndex, arrayIndex) {$scope.data[subgroupIndex].paths.splice(arrayIndex, 1);}
})

class transferSubgroupInfo {
	constructor()
	{
		this.allowedRaces = [];
		this.disallowedRaces= [];
		this.allowedAttributes = [];
		this.disallowedAttributes = [];
		this.requiredSubgroups = [];
		this.excludedSubgroups = [];
		this.paths = [];
	}
}

