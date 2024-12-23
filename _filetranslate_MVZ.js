//=============================================================================
// _filetranslate_MV.js
//=============================================================================
/*:
 * @plugindesc Plugin for automatic translation of game texts.
 * @author
 * @help This plugin uses either combined translations dictionary
 * 	from `data\_combined.csv` which uses `\n` as replacer for newlines
 * 	or separate translations for each data JSON from
 * 	`data\{JSON name without extension}_[strings|attributes].csv`
 * 	both with `source→translation→context` format.
 *
 *  NOTE: Arrows (`→`), newlines and the escape character itself
 * 		  can be escaped with `¶` character.
 *
 *
 * @param Whole Script Lines
 * @desc Sets how to handle script translation.
 * @type boolean
 * @on Replace the scripts one line at a time (recommended)
 * @off Replace only the text inside the `"`/`'`  marks.
 * @default false
 *
 * @param Ignore Rare
 * @desc Sets how to handle
 * @type boolean
 * @on Ignore codes that rarely contain displayed text (recommended)
 * @off Check all known codes with text.
 * @default false
 *
 * @param Replace Attribute Spaces
 * @desc Sets how to handle plugin texts.
 * @type boolean
 * @on Replace spaces with underscores (_) before sending them to the plugin.
 * @off Send the translation as is.
 * @default true
 */

(() => {
"use strict";

const PLUGIN_NAME = "_filetranslate_MVZ";
const MV_MODE = (Utils.RPGMAKER_NAME === "MV");

const fs = require("fs");
const getBoolean = (str) => { return !!str && !!str.match(/(?:true|y(?:es)?)/i) };

//----------------------------------
// Set items
//----------------------------------
const DEBUG = false;

const PARAM = PluginManager.parameters(PLUGIN_NAME);
const SCRIPT_WHOLE_LINES = getBoolean(PARAM["Whole Script Lines"] || "true");
const IGNORE_RARE = getBoolean(PARAM["Ignore Rare"] || "false");
const NO_SPACES_FOR_PLUGINS = getBoolean(PARAM["Replace Attribute Spaces"] || "true");
const LINE_MERGE_CHARACTER = String(PARAM["Line-merge Character"] || '');
const MERGED_TRANSLATION_PATH = String(PARAM["Merged Translations"] || "data/_combined.csv");

const TRANSLATED_KEY = "translated"
const IMG_TRANSLATION_FOLDER = "$1" + TRANSLATED_KEY + "/$2";
const CSV_SEPARATOR = '→';
const CSV_ESCAPE = '¶';

//----------------------------------
// Main functionality
//----------------------------------

// Extracts array of parts surrounded by " or ' quotes from the text
const extractQuotedStrings = (str) => {
	const pattern = /([\"\'])((?:\\\1|.)*?)\1/g;
	let match, results = [];
	while ((match = pattern.exec(str)) !== null)
		if (match[2])
			results.push(match[2]);
	return results;
};

const setObjData = ((obj, property, dataTranslation) => {
	if (!obj || !dataTranslation || !property) return;
	if (obj.hasOwnProperty(property) && obj[property] &&
		obj[property] in dataTranslation && dataTranslation[obj[property]]) {
		obj[property] = dataTranslation[obj[property]];
		if (property === "note")
			DataManager.extractMetadata(obj);
	}
});

const setArrayData = ((array, dataTranslation) => {
	if (!array || !dataTranslation) return;
	if (Array.isArray(array)) {
		array.forEach((item, index) => {
			if (item in dataTranslation && dataTranslation[item])
				array[index] = dataTranslation[item];
		});
	}
});

const setObjDataOnBasicDatabase = ((data, dataTranslation) => {
	if (!data || !dataTranslation) return;
	//data?.forEach((obj) => { // we'll need Chromium 90+ for this
	data.forEach((obj) => {
		//It's necessary to generate metadata if including `note`
		["name", "nickname", "profile", "note", "description",
			"message1", "message2", "message3", "message4"
		].forEach((property) => {
			setObjData(obj, property, dataTranslation);
		});
	});
});

const setObjDataOnSystem = ((data, dataTranslation) => {
	if (!data || !dataTranslation) return;
	setObjData(data, "gameTitle", dataTranslation);
	["armorTypes", "elements", "equipTypes", "skillTypes", "weaponTypes"
	].forEach((property) => {
		setArrayData(data[property], dataTranslation);
	});
	["basic", "commands", "params"].forEach((property) => {
		setArrayData(data.terms[property], dataTranslation);
	});
	Object.keys(data.terms.messages).forEach((key) => {
		setObjData(data.terms.messages, key, dataTranslation);
	});
});

const setTroops = ((data, dataTranslation) => {
	if (!data || !dataTranslation) return;
	data.forEach((obj) => {
		if (obj && obj.pages)
			setEvents(obj.pages, dataTranslation, null);
	});
});

const setEvents = ((data, attributesTranslation, stringsTranslation) => {
	if (!data || !attributesTranslation && !stringsTranslation) return;
	data.forEach((obj) => {
		if (obj && obj.list)
			setEventList(obj.list, attributesTranslation, stringsTranslation);
	});
});

const setMapEvents = ((data, attributesTranslation, stringsTranslation) => {
	if (!data) return;
	if (attributesTranslation && data.displayName && data.displayName in attributesTranslation)
		data.displayName = attributesTranslation[data.displayName];
	setObjData(data, "note", attributesTranslation);
	if (!data.events) return;
	data.events.forEach((event) => {
		if (!event) return;
		setObjData(event, "note", attributesTranslation);
		if (event.pages)
			event.pages.forEach((page) => {
				if (page && page.list)
					setEventList(page.list, attributesTranslation, stringsTranslation);
			});
	});
});

const setEventList = (eventList, attributesTranslation, stringsTranslation) => {
	if (!attributesTranslation && !stringsTranslation) return;

	const stringsAreArray = Array.isArray(stringsTranslation);

	const rpgCode = (code, indent, parameters) => ({ code, indent, parameters });

	const getNextEventCode = (array, nextIndex) => array[nextIndex] && array[nextIndex].code || 0;

	// Whether the script contains full-width characters (if it doesn't, we don't do character substitution)
	const checkFullCharacter = (str) => /[^\u0000-\u00ff]/.test(str);

	const replaceScript = (scriptText, dataTranslation) => {
		if (!checkFullCharacter(scriptText)) return { scriptText, isChanged: false };

		const jpTexts = extractQuotedStrings(scriptText);
		if (!jpTexts) return { scriptText, isChanged: false };

		let isChanged = false;
		jpTexts.forEach((text) => {
			if (checkFullCharacter(text) && text in dataTranslation) {
				scriptText = scriptText.replace(text, dataTranslation[text]);
				isChanged = true;
			}
		});

		return { scriptText, isChanged };
	};

	const handleScript = (params, index) => {
		if (!attributesTranslation) return;
		if (SCRIPT_WHOLE_LINES) {
			if (params[index] in attributesTranslation && attributesTranslation[params[index]]) {
				params[index] = attributesTranslation[params[index]];
			}
		} else {
			const { scriptText, isChanged } = replaceScript(params[index], attributesTranslation);
			if (isChanged && scriptText) params[index] = scriptText;
		}
	};

	for (let _index = 0; _index < eventList.length; _index++) {
		if (!eventList[_index]) continue;

		const code = eventList[_index].code, parameters = eventList[_index].parameters;

		const processTextEvent = (eventCode, getTextFunc, separateBy, separatorRpgCode, pushFirst) => {
			let codedTexts = [],
				prev_indent = eventList[_index - 1].indent,
				prev_params = eventList[_index - 1].parameters,
				count = 0;

			while (pushFirst || getNextEventCode(eventList, count + _index) === eventCode) {
				codedTexts.push(getTextFunc(eventList[count + _index]));
				count++;
				if (pushFirst) pushFirst = false;
			}

			let i = codedTexts.length - 1;
			while (i >= 0 && codedTexts[i] === "") i--;
			let codedTextsTrimmed = codedTexts.slice(0, i + 1);
			if (!codedTextsTrimmed.length) return;

			const translateLines = (translations, is_list, is_merged=false) => {
				translations.forEach((text, i) => {
					if (i < codedTextsTrimmed.length) {
						// NOTE: not for some strange 401's with >1 params
						eventList[_index + i].parameters[0] = is_list ? text[1] : text;
					} else {
						// insert new text separators and then add text lines when needed
						if (separateBy && i % separateBy === 0) {
							eventList.splice(_index + i, 0, separatorRpgCode(prev_indent, prev_params));
							_index++;
						}
						eventList.splice(_index + i, 0,
							rpgCode(eventCode, prev_indent, [is_list ? text[1] : text]));
					}
				});
				if (is_merged) {
					// reset all following text lines if we merged them beforehand
					for (let i = 1; i < codedTexts.length; i++)
						eventList[_index + i].parameters[0] = '';
				}
			}

			const combinedText = codedTextsTrimmed.join(LINE_MERGE_CHARACTER);
			if (combinedText === '') {
				_index += count - 1;
				return;
			}
			if (!stringsAreArray && stringsTranslation && combinedText in stringsTranslation) {
				const translations = codedTextsTrimmed;
				translateLines(translations, false);
				_index += Math.max(codedTextsTrimmed.length, translations.length) - 1;
			} else if (stringsAreArray && stringsTranslation.length) {
				// Attempt to find a matching sequence in stringsTranslation
				let translationFound = false, merged_lines = false, translationIndex = 0;
				for (let i = 0; i < stringsTranslation.length; i++) {
					let match = true;
					for (let j = 0; j < codedTextsTrimmed.length; j++) {
						if (i + j > stringsTranslation.length - 1 || stringsTranslation[i + j][0] !== codedTextsTrimmed[j]) {
							match = false;
							break;
						}
					}
					if (!match) {
						if (combinedText == stringsTranslation[i][0]) {
							merged_lines = true;
							match = true;
						}
					}
					if (match) {
						translationFound = true, translationIndex = i;
						break;
					}
				}
				if (translationFound) {
					const translations = stringsTranslation.splice(
						translationIndex, translationIndex + merged_lines ? 1 : codedTextsTrimmed.length
					);
					translateLines(translations, true, merged_lines);
				}
				else
					_index += count - 1;
			} else
				_index += count - 1;
		};

		switch (code) {
			case 401: // Text data
				processTextEvent(code, (event) => event.parameters[0], 4,
					(indent, params) => rpgCode(101, indent, params), false);
				break;
			case 405: // Scrolling Text
				processTextEvent(code, (event) => event.parameters[0], 0, null, false);
				break;
			case 102: // Show Choices
				setArrayData(parameters[0], attributesTranslation);
				break;
			case 402: // When [**]
				if (!IGNORE_RARE && attributesTranslation && parameters[1] in attributesTranslation)
					parameters[1] = attributesTranslation[parameters[1]];
				break;
			case 122: // Control Variables
				if (!IGNORE_RARE && parameters[3] === 4)
					handleScript(parameters, 4);
				break;
			case 111: // Conditional Branch
				if (!IGNORE_RARE && parameters[0] === 12 && parameters[1])
					handleScript(parameters, 1);
				break;
			case 108: // Comment
				if (!IGNORE_RARE) {
					processTextEvent(408, (event) => event.parameters[0], 6,
						(indent, text) => rpgCode(108, indent, [text]), true);
				}
				break;
			case 408: // Multi-line Comment
				break;
			case 320: // Change Name
			case 324: // Change Nickname
			case 325: // Change Profile
				if (!IGNORE_RARE && attributesTranslation && parameters[1] in attributesTranslation && attributesTranslation[parameters[1]])
					parameters[1] = attributesTranslation[parameters[1]];
				break;
			case 355: // Script
				if (!IGNORE_RARE) {
					handleScript(parameters, 0);
					_index++;
					while (getNextEventCode(eventList, _index) === 655) {
						handleScript(eventList[_index].parameters, 0);
						_index++;
					}
					_index--;
				}
				break;
			case 655: // Multi-line script
				break;
			case 356: // Plugin Command
				if (!IGNORE_RARE) {
					const splitParams = parameters[0].split(/\s+/);
					let changed = false;
					for (let i = 1; i < splitParams.length; i++) {
						let param = splitParams[i];
						if (attributesTranslation && param in attributesTranslation && attributesTranslation[param]) {
							const tl = attributesTranslation[param];
							splitParams[i] = NO_SPACES_FOR_PLUGINS ? tl.replace(/ /g, '_') : tl;
							changed = true;
						}
					}
					if (changed)
						parameters[0] = splitParams.join(' ')
				}
				break;
			  case 357: // Plugin Command (MZ)
				if (MV_MODE || !attributesTranslation ||
					!Array.isArray(parameters) || parameters.length < 4)
						break;
				const replaceKVText = ((param_obj) => {
					if (parameters[1] in param_obj) {
						const commandKey = param_obj[parameters[1]];
						if (commandKey in parameters[3] && parameters[3][commandKey] in attributesTranslation) {
							const translation = attributesTranslation[parameters[3][commandKey]];
							parameters[3][commandKey] = NO_SPACES_FOR_PLUGINS ? translation.replace(/ /g, '_') : translation;
						}
				  }
				});
				// A simple text replacer for specific objects
				const kvp = substPlaceholders();
				Object.keys(kvp).forEach((key) => {
					if (parameters[0] === key)
						replaceKVText(kvp[key]);
				});
				break;
		}
	}
};


function csvToArray(text, toDict) {
	if (!text) return null;
	const ch_newline = '\n';
	let pletter = '',
		row = [''],
		ret = [row],
		i = 0,
		r = 0,
		unescaped = true;
	for (let letter of text) {
		if (CSV_ESCAPE === letter) {
			if (!unescaped && pletter === CSV_ESCAPE) row[i] += letter;
			unescaped = !unescaped;
		} else if (CSV_SEPARATOR === letter && unescaped) letter = row[++i] = '';
		else if (ch_newline === letter && unescaped) {
			if ('\r' === pletter) row[i] = row[i].slice(0, -1);
			row = ret[++r] = [letter = ''];
			i = 0;
		} else {
			row[i] += letter;
			if (!unescaped) unescaped = true;
		}
		pletter = letter;
	}
	if (toDict)
		return Object.assign({}, ...ret.map((x) => ({ [x[0]]: x[1] })));
	return ret;
};

function getXHRFile(file, callback, onerror, type) {
	const xhr = new XMLHttpRequest();
	if (typeof type === "undefined" || !type) type = "text/plain";
	xhr.overrideMimeType(type);
	xhr.onload = function () {
		if (xhr.status >= 400 || xhr.responseText.length === 0) {
			onerror();
			return;
		}
		callback(xhr.responseText);
	}
	xhr.onerror = onerror;
	xhr.open("GET", file); //, false);
	xhr.send(null);
}

// Single dict approach is a bad idea but can work out for some simpler games
function getMergedTranslations(path) {
	if (!fs.existsSync((MV_MODE ? "www/" : '') + path))
		return null;
	const xhr = new XMLHttpRequest();
	xhr.overrideMimeType("text/plain");
	xhr.open("GET", path, false);
	xhr.send(null);
	if (xhr.status < 400 && xhr.responseText.length > 0) {
		const merged = csvToArray(xhr.responseText, false);
		if (!merged) return null;
		return Object.assign({}, ...merged.map((x) => ({
			[x[0].replace(/\\n/g, '\n')]: x[1].replace(/\\n/g, '\n')
		})));
	}
	return null;
}

var	merged = getMergedTranslations(MERGED_TRANSLATION_PATH)
const	merged_strings = merged,
		merged_attrs = merged;
merged = null;

//----------------------------------
// RPG Maker patches
//----------------------------------

// JSON translation wrapper
DataManager.loadDataFile = function (name, src) {
	if (!src) return;
	window[name] = null;
	const attr_fname = "data/" + src.replace(".json", '') + "_attributes.csv";
	const str_fname = "data/" + src.replace(".json", '') + "_strings.csv";
	const url = "data/" + src;

	const parseResponse = function (text) {
		var data = null;
		try {
			data = JSON.parse(text);
		} catch (e) {
			var pos = parseInt(e.message.match(/position (\d+)/)[1]);
			var err = text.slice(pos - 20, pos + 20);
			throw e.message + " in " + src + " Text:<br>" + err + " ";
		}
		const attrCallback = function (text) {
			const attributes = merged_attrs ? merged_attrs : csvToArray(text, true);
			if (/Actors|Armors|Items|Weapons|Classes|Skills|Enemies|States/.test(src)) {
				setObjDataOnBasicDatabase(data, attributes);
			} else if (src.includes("System")) {
				setObjDataOnSystem(data, attributes);
			} else if (src.includes("Troops")) {
				setTroops(data, attributes);
			} else if (src.includes("Events")) {
				if (merged_strings || !fs.existsSync(MV_MODE ? "www/" + str_fname : str_fname)) {
					setEvents(data, merged_strings, merged_attrs);
				} else {
					const strCallback = function (text) {
						setEvents(data, attributes, csvToArray(text, false));
						window[name] = data;
						DataManager.onLoad(window[name]);
					}
					getXHRFile(str_fname, strCallback, () => { strCallback(null); });
					return;
				}
			} else if (/Map\d+/.test(src)) {
				if (merged_strings || !fs.existsSync(MV_MODE ? "www/" + str_fname : str_fname)) {
					setMapEvents(data, merged_strings, merged_attrs);
				} else {
					const strCallback = function (text) {
						setMapEvents(data, attributes, csvToArray(text, false));
						window[name] = data;
						DataManager.onLoad(window[name]);
					}
					getXHRFile(str_fname, strCallback, () => { strCallback(null); });
					return;
				}
			}
			window[name] = data;
			DataManager.onLoad(window[name]);
		}

		if (merged_strings || !fs.existsSync(MV_MODE ? "www/" + attr_fname : attr_fname))
			attrCallback(null);
		else
			getXHRFile(attr_fname, attrCallback, () => { attrCallback(null); });
	};

	const onError = MV_MODE ?
		this._mapLoader || (() => { DataManager._errorUrl = DataManager._errorUrl || url }) :
		(() => this.onXhrError(name, src, url));
	getXHRFile("data/" + src, parseResponse, onError, "application/json");
};

// Image translation wrapper
if (MV_MODE) {
	const _originalRequestImage = Bitmap.prototype._requestImage;
	Bitmap.prototype._requestImage = function (url) {
		//TRANSLATED_KEY check is there because of the recursive calls to _requestImage(url) with a previously set this._url
		const translatedFilePath = !url.contains("/" + TRANSLATED_KEY + "/") ? url.replace(/^(.*\/)([^\/]+)$/, IMG_TRANSLATION_FOLDER) : url;
		if (fs.existsSync("www/" + translatedFilePath)) {
			this._image = Bitmap._reuseImages.length !== 0 ? Bitmap._reuseImages.pop() : new Image();
			//this._decodeAfterRequest = true; // NOTE: alt approach
			if (this._decodeAfterRequest && !this._loader)
				this._loader = ResourceHandler.createLoader(url, this._requestImage.bind(this, url), this._onError.bind(this));

			this._url = translatedFilePath;
			this._loadingState = "requesting";
			this._image.src = translatedFilePath;

			this._image.addEventListener("load", this._loadListener = Bitmap.prototype._onLoad.bind(this));
			this._image.addEventListener("error", this._errorListener = this._loader || Bitmap.prototype._onError.bind(this));

			if (DEBUG)
				console.log("Using translated image:", translatedFilePath);
		} else
			_originalRequestImage.apply(this, arguments);
	};
} else {
	const _originalStartLoading = Bitmap.prototype._startLoading;
	Bitmap.prototype._startLoading = function() {
		this._image = new Image();
		this._image.onload = this._onLoad.bind(this);
		this._image.onerror = this._onError.bind(this);
		this._destroyCanvas();
		this._loadingState = "loading";

		const translatedFilePath = this._url.replace(/^(.*\/)([^\/]+)$/, IMG_TRANSLATION_FOLDER);
		if (fs.existsSync(translatedFilePath)) {
			this._url = translatedFilePath;
			this._image.src = translatedFilePath;
			if (this._image.width > 0) {
				this._image.onload = null;
				this._onLoad();
				if (DEBUG)
					console.log("Using translated image:", translatedFilePath);
			}
		} else
			_originalStartLoading.apply(this, arguments);
	};
}

//---------------------------
// Plugin text placeholders
//---------------------------
const substPlaceholders = (() => {
	return {
	//"Plugin name" : {"Command name": "Argument name with text to be replaced"}
	  "TextPicture" : { "set" : "text" },
	  "DestinationWindow" : { "SET_DESTINATION" : "destination" },
	  "TorigoyaMZ_NotifyMessage": { "notify" : "message", "notifyWithVariableIcon" : "message" }
	};
});

})();