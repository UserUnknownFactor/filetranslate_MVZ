//=============================================================================
// _filetranslate_MV.js
//=============================================================================
/*:
 * @plugindesc Plugin for automatic translation of game texts.
 * @author
 * @help This plugin uses either combined translations dictionary
 *   from `data\_combined.csv` which uses `\n` as replacer for newlines
 *   or separate translations for each data JSON from
 *   `data\{JSON name without extension}_[strings|attributes].csv`
 *   both with `source→translation→context` format.
 *
 * To translate images simply put them as is into a `translated`
 * subfolder of the corresponding images folder.
 *
 *  NOTE: Arrows (`→`), newlines (`\n`) and the escape character itself
 *        can be escaped with `¶` character.
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
 * @desc Sets which text-containing codes to ignore, see the values in the code
 * @type Array
 * @default [402, 122, 111, 108, 408, 320, 324, 325, 655]
 *
 * @param Line-merge Character
 * @desc Sets which character was used on merged 401 texts etc.
 * @type string
 * @default ''
 *
 * @param Replace Attribute Spaces
 * @desc Sets how to handle plugin texts.
 * @type boolean
 * @on Replace spaces with underscores (_) before sending them to the plugin.
 * @off Send the translation as is.
 * @default true
 *
 * @param Merged Translations
 * @desc Specifies the location of the merged translations CSV file, it'll be used as the global dictionary if found.
 * @type string
 * @default "data/_combined.csv"
  *
 * @param Default Language
 * @desc Specifies the default menu and translation language. The two-letter language code must be prepended with underscore.
 * @type string
 * @default ''
  *
 * @param Languages Data
 * @desc JSON encoded object with supported languages and their spritesheet icons. See its format in the code.
 * @type string
 * @default <see the code>
 *
 * @param Ignored Characters
 * @text Characters that cannot appear at the beginning of a line.
 * @desc Do not break in the specified characters (but break normally if it occurs consecutively).
 * @default "♥♡♪;”’!！?？)）〕]］｝」』＞》】,，、.．。　"
 * @type string
 *
 * @param Text Margin
 * @desc Margin on the both sides of the message window.
 * @default 10
 * @type number
 *
 * @param Enable Wordwrap
 * @desc Toggles message window word-wrapping
 * @type boolean
 * @on Words are wrapped before reaching the window edge.
 * @off Show the text as is and disable any related overrides.
 * @default true
 *
 * @param Override Font Sizes
 * @desc Allow font overriding based on corresponding Languages Data fields.
 * @type boolean
 * @on Override font sizes if there is a corresponding field filled.
 * @off Disable the entire functionality and any related overrides.
 * @default false
 *
 * Terms of Use:
 * - Free for commercial and non-commercial use.
 */

(() => {
"use strict";

const PLUGIN_NAME = "_filetranslate_MVZ";
const MV_MODE = (Utils.RPGMAKER_NAME === "MV");

const fs = require("fs");
const getBoolean = (str) => { return !!str && !!str.match(/(?:true|y(?:es)?)/i) };
const getArray = (str) => { return (typeof str === "undefined") ? [] : ((typeof str === "string") ? JSON.parse(str) : str)};

//----------------------------------
// Set items
//----------------------------------
const DEBUG = false;

const parameters = PluginManager.parameters(PLUGIN_NAME);
const SCRIPT_WHOLE_LINES = getBoolean(parameters["Whole Script Lines"] || "true");
const IGNORE_RARE = getArray(parameters["Ignore Rare"] || [402, 122, 111, 108, 408, 320, 324, 325, 655]);
const NO_SPACES_FOR_PLUGINS = getBoolean(parameters["Replace Attribute Spaces"] || "true");
const LINE_MERGE_CHARACTER = String(parameters["Line-merge Character"] || '');
const MERGED_TRANSLATION_PATH = String(parameters["Merged Translations"] || "data/_combined");
const DEFAULT_LANGUAGE = parameters["Default Language"] ? `${parameters["defaultLanguage"]}` : '';
const MARGIN = Number(parameters['Text Margin'] || 10);
const IGNORE_CHARS = String(parameters['Ignored Characters'] || "♥♡♪;”’!！?？)）〕]］｝」』＞》】,，、.．。　"); // at start; (（〔［｛「『＜《【"} at end;
const ENABLE_WORDWRAP = getBoolean(parameters['Enable Wordwrap'] || "true");
const OVERRIDE_FONTS = getBoolean(parameters["Override Font Sizes"] || "false");;
const LANGUAGE_MAPPING = parameters["Languages Data"] ? JSON.parse(parameters["Languages Data"]) : {
	// BFS: battle font size; message font size; HFS: help font size (deafult: 28)
	// See below for the rest (default: 26)
	'':  { name: "English", flagY: 2912, buttonText: "Language", BFS: 28,  MFS: 28, HFS: 28 },
	//"_en": { name: "English", flagX: 0, flagY: 2912, buttonText: "Language" },
	"_jp": { name: "Japanese", flagY: 3968, buttonText: "Language", disable: true },
};

const TRANSLATED_KEY = "translated"
const CSV_SEPARATOR = '→';
const CSV_ESCAPE = '¶';

const LANGUAGES_PNG = "country_flags_32";
const LANG_SPRITE_HEIGHT = 32;

//----------------------------------
// Options functionality
//----------------------------------
ConfigManager.language = DEFAULT_LANGUAGE;

const _ConfigManager_makeData = ConfigManager.makeData;
ConfigManager.makeData = function() {
	const config = _ConfigManager_makeData.call(this);
	config.language = this.language;
	return config;
};

const _ConfigManager_applyData = ConfigManager.applyData;
ConfigManager.applyData = function(config) {
	_ConfigManager_applyData.call(this, config);
	this.language = config.language !== undefined ? config.language : DEFAULT_LANGUAGE;
};

// Add initialization to Window_Options
const _Window_Options_initialize = Window_Options.prototype.initialize;
Window_Options.prototype.initialize = function() {
	_Window_Options_initialize.call(this);
	if (!ConfigManager.language) {
		ConfigManager.language = DEFAULT_LANGUAGE;
		ConfigManager.save();
	}
};

const _Window_Options_addGeneralOptions = Window_Options.prototype.addGeneralOptions;
Window_Options.prototype.addGeneralOptions = function() {
	_Window_Options_addGeneralOptions.call(this);
	this.addCommand(LANGUAGE_MAPPING[ConfigManager.language].buttonText, "language");
};

const _Window_Options_getConfigValue = Window_Options.prototype.getConfigValue;
Window_Options.prototype.getConfigValue = function(symbol) {
	if (symbol === "language")
		return ConfigManager.language;
	return _Window_Options_getConfigValue.call(this, symbol);
};

const _Window_Options_setConfigValue = Window_Options.prototype.setConfigValue;
Window_Options.prototype.setConfigValue = function(symbol, value) {
	if (symbol === "language")
		ConfigManager.language = value;
	else
		_Window_Options_setConfigValue.call(this, symbol, value);
};

const _Window_Options_processOk = Window_Options.prototype.processOk;
Window_Options.prototype.processOk = function() {
	if (this.commandSymbol(this.index()) === "language") {
		const rect = this.itemRect(this.index());
		this._languageWindow = new Window_LanguageSelection();
		this._languageWindow.x = this.x + this.width;
		this._languageWindow.y = this.y + rect.y;

		this._languageWindow.setHandler("ok", this.onLanguageOk.bind(this));
		this._languageWindow.setHandler("cancel", this.onLanguageCancel.bind(this));

		SceneManager._scene.addChild(this._languageWindow);
		this._languageWindow.select(Object.keys(LANGUAGE_MAPPING).indexOf(ConfigManager.language));
		this.deactivate();
		this._languageWindow.activate();
	} else
		_Window_Options_processOk.call(this);
};

Window_Options.prototype.onLanguageOk = function() {
	const selectedLanguage = this._languageWindow.currentLanguageCode();
	ConfigManager.language = selectedLanguage;
	ConfigManager.save();
	this._languageWindow.hide();
	SceneManager._scene.removeChild(this._languageWindow);
	this._languageWindow = null;
	this.activate();
	this.refresh();
};

Window_Options.prototype.onLanguageCancel = function() {
	this._languageWindow.hide();
	SceneManager._scene.removeChild(this._languageWindow);
	this._languageWindow = null;
	this.activate();
};

const _Window_Options_drawItem = Window_Options.prototype.drawItem;
Window_Options.prototype.drawItem = function(index) {
	const symbol = this.commandSymbol(index);
	const rect = this.itemRectForText(index);

	if (symbol === "language") {
		const language = LANGUAGE_MAPPING[ConfigManager.language] || LANGUAGE_MAPPING[''];
		this.changeTextColor(this.normalColor());
		this.drawText(LANGUAGE_MAPPING[ConfigManager.language].buttonText, rect.x, rect.y, rect.width - 40, "left");
		if (language)
			this.drawFlagIcon(language.flagX, language.flagY, rect.x + rect.width - 39, rect.y);
	} else
		_Window_Options_drawItem.call(this, index);
};

function Window_LanguageSelection() {
	this.initialize.apply(this, arguments);
}

Window_LanguageSelection.prototype = Object.create(Window_Command.prototype);
Window_LanguageSelection.prototype.constructor = Window_LanguageSelection;

Window_LanguageSelection.prototype.initialize = function() {
	const width = 240;
	const height = this.windowHeight();
	Window_Command.prototype.initialize.call(this, 0, 0);
	this.width = width;
	this.height = height;
};

Window_LanguageSelection.prototype.windowHeight = function() {
	return this.fittingHeight(Object.keys(LANGUAGE_MAPPING).length);
};

Window_LanguageSelection.prototype.makeCommandList = function() {
	for (const code in LANGUAGE_MAPPING) {
		const language = LANGUAGE_MAPPING[code];
		this.addCommand(language.name, "ok", true, { code: code, flagX: language.flagX, flagY: language.flagY });
	}
};

Window_LanguageSelection.prototype.drawItem = function(index) {
	const rect = this.itemRectForText(index);
	const language = this._list[index].ext;
	this.drawFlagIcon(language.flagX, language.flagY, rect.x, rect.y);
	this.drawText(this.commandName(index), rect.x + 40, rect.y, rect.width - 40, "left");
};

Window_LanguageSelection.prototype.currentLanguageCode = function() {
	return this.currentExt().code;
};

Window_Base.prototype.drawFlagIcon = function(flagX, flagY, x, y) {
	flagY = parseInt(flagY) || 0;
	flagX = parseInt(flagX) || 0;
	flagY = Math.floor(flagY/LANG_SPRITE_HEIGHT) * LANG_SPRITE_HEIGHT;
	const bitmap = ImageManager.loadSystem(LANGUAGES_PNG);
	if (bitmap.isReady()) {
		const pw = LANG_SPRITE_HEIGHT;
		const ph = LANG_SPRITE_HEIGHT;
		this.contents.blt(bitmap, flagX, flagY, pw, ph, x, y, pw, ph);
	} else {
		bitmap.addLoadListener(() => {
			const pw = LANG_SPRITE_HEIGHT;
			const ph = LANG_SPRITE_HEIGHT;
			this.contents.blt(bitmap, flagX, flagY, pw, ph, x, y, pw, ph);
			this.refresh();
		});
	}
};

const _Scene_Boot_start = Scene_Boot.prototype.start;
Scene_Boot.prototype.start = function() {
	_Scene_Boot_start.call(this);
	if (ConfigManager.language === undefined) {
		ConfigManager.language = DEFAULT_LANGUAGE;
		ConfigManager.save();
	}
};

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

	const sourceSet = stringsAreArray ? new Set(stringsTranslation.map(row => row[0])) : new Set();

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
				// BUGFIX: the inner text's quote characters will break it otherwise // either use
				//dataTranslation[text].replace(/(?<=\w)'(?=\w)/g, "’").replace(/([\"\'])((?:\\\1|.)*?)\1/g, '“$2”'); // or
				//dataTranslation[text].replace(/(?<=[^\\])["']/g, "\\$1");
				scriptText = scriptText.replace(text, dataTranslation[text].replace(/(?<=[^\\])["']/g, "\\$1"));
				isChanged = true;
			}
		});

		return { scriptText, isChanged };
	};

	const handleScript = (params, index) => {
		if (!attributesTranslation) return;
		if (SCRIPT_WHOLE_LINES) {
			if (params[index] in attributesTranslation && attributesTranslation[params[index]]) {
				// NOTE: You should correct quotes manually for this since they're obvious there
				params[index] = attributesTranslation[params[index]];
			}
		} else {
			const { scriptText, isChanged } = replaceScript(params[index], attributesTranslation);
			if (isChanged && scriptText)
				params[index] = scriptText;
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
			if (!codedTextsTrimmed.length) {
				if (count > 1) _index += count - 1;
				return;
			}

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
				const hasCombined = sourceSet.has(combinedText);
				const hasSeparate = !hasCombined && codedTextsTrimmed.filter(
						e => !(!e || !e.replace(/(?:^\s+|\s+$)/gm,''))
					).every(s => sourceSet.has(s));
				if (!hasCombined && !hasSeparate) {
					_index += count - 1;
					return; // don't bother if the strings aren't translated at all
				}
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
				if (IGNORE_RARE.indexOf(code) === -1 && attributesTranslation && parameters[1] in attributesTranslation)
					parameters[1] = attributesTranslation[parameters[1]];
				break;
			case 122: // Control Variables
				if (IGNORE_RARE.indexOf(code) === -1 && parameters[3] === 4)
					handleScript(parameters, 4);
				break;
			case 111: // Conditional Branch
				if (IGNORE_RARE.indexOf(code) === -1 && parameters[0] === 12 && parameters[1])
					handleScript(parameters, 1);
				break;
			case 108: // Comment
				if (IGNORE_RARE.indexOf(code) !== -1)
					break;
				processTextEvent(408, (event) => event.parameters[0], 6,
					(indent, text) => rpgCode(108, indent, [text]), true);
				break;
			case 408: // Multi-line Comment (stray)
				break;
			case 320: // Change Name
			case 324: // Change Nickname
			case 325: // Change Profile
				if (IGNORE_RARE.indexOf(code) === -1 && attributesTranslation &&
						parameters[1] in attributesTranslation && attributesTranslation[parameters[1]])
					parameters[1] = attributesTranslation[parameters[1]];
				break;
			case 355: // Script
				if (IGNORE_RARE.indexOf(code) !== -1)
					break;
				handleScript(parameters, 0);
				_index++;
				while (getNextEventCode(eventList, _index) === 655) {
					handleScript(eventList[_index].parameters, 0);
					_index++;
				}
				_index--;
				break;
			case 655: // Multi-line script (stray)
				break;
			case 356: // Plugin Command
				if (IGNORE_RARE.indexOf(code) !== -1)
					break;
				const splitParams = parameters[0].split(/\s+/);
				let changed = false;
				for (let i = 1; i < splitParams.length; i++) {
					let param = splitParams[i];
					if (attributesTranslation && param in attributesTranslation && attributesTranslation[param]) {
						const tl = attributesTranslation[param];
						splitParams[i] = NO_SPACES_FOR_PLUGINS ? tl.replace(/ /g, '_') : tl;
						changed = true;
					}
					if (changed)
						parameters[0] = splitParams.join(' ');
				}
				break;
			case 357: // Plugin Command (MZ)
				if (IGNORE_RARE.indexOf(code) !== -1)
					break;
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
				// A simple text replacer for specific object properties of known plugins
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
	if (!text) return [];
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
	// Filter out unused rows
	// (comments, detected by `//` not present in the translation, and empty lines)
	ret = ret.filter(list => typeof list[0] === 'string' && list.length > 1 &&
			!(list[0].startsWith('//') && !list[1].startsWith('//')));
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

var	merged = getMergedTranslations(`${MERGED_TRANSLATION_PATH}${ConfigManager.language}.csv`)
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
	const currentLng = ConfigManager.language;
	const attr_fname = `data/${src.replace(".json", '')}${currentLng}_attributes.csv`;
	const str_fname = `data/${src.replace(".json", '')}${currentLng}_strings.csv`;
	const url = "data/" + src;
	const isDisabled = LANGUAGE_MAPPING[currentLng].disable;

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
			if (!isDisabled) {
				const attributes = merged_attrs ? merged_attrs : csvToArray(text, true);
				if (/Actors|Armors|Items|Weapons|Classes|Skills|Enemies|States/.test(src)) {
					setObjDataOnBasicDatabase(data, attributes);
				} else if (src.includes("System")) {
					setObjDataOnSystem(data, attributes);
				} else if (src.includes("Troops")) {
					setTroops(data, attributes);
				} else if (src.includes("Events")) {
					if (merged_strings || !fs.existsSync(MV_MODE ? "www/" + str_fname : str_fname)) {
						setEvents(data, attributes, merged_strings);
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
						setMapEvents(data, attributes, merged_strings);
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
			}
			window[name] = data;
			DataManager.onLoad(window[name]);
		}

		if (!!isDisabled || merged_strings || !fs.existsSync(MV_MODE ? "www/" + attr_fname : attr_fname))
			attrCallback(null);
		else
			getXHRFile(attr_fname, attrCallback, () => { attrCallback(null); });
	};

	const onError = MV_MODE ?
		this._mapLoader || (() => { DataManager._errorUrl = DataManager._errorUrl || url }) :
		(() => this.onXhrError(name, src, url));
	getXHRFile("data/" + src, parseResponse, onError, "application/json");
};


// Font size management for a specific language
if (OVERRIDE_FONTS) {
	if (MV_MODE) { // MV
		// Default MV font sizes: Most = 26~28
		function wrapStandardFontSize(windowClass, fontSizeKey) {
			const originalMethod = windowClass.prototype.standardFontSize;
			windowClass.prototype.standardFontSize = function() {
				const fontSize = parseInt(LANGUAGE_MAPPING[ConfigManager.language][fontSizeKey] || 0);
				if (fontSize > 1)
					return fontSize;
				return originalMethod.call(this);
			};
		}
		wrapStandardFontSize(Window_Message, 'MFS');  // Dialog messages

		// Battle-related
		wrapStandardFontSize(Window_BattleLog, 'BFS');     // Battle messages
		wrapStandardFontSize(Window_BattleStatus, 'BSS');  // Party status in battle
		wrapStandardFontSize(Window_BattleActor, 'BAS');   // Actor selection
		wrapStandardFontSize(Window_BattleEnemy, 'BES');   // Enemy selection
		wrapStandardFontSize(Window_BattleSkill, 'BSK');   // Skill selection
		wrapStandardFontSize(Window_BattleItem, 'BIS');    // Item selection

		// Menu-related
		wrapStandardFontSize(Window_Help, 'HFS');         // Help/description text
		wrapStandardFontSize(Window_MenuStatus, 'MSS');   // Party status in menu
		wrapStandardFontSize(Window_Status, 'STS');       // Status screen
		wrapStandardFontSize(Window_ItemList, 'ILS');     // Item list
		wrapStandardFontSize(Window_SkillList, 'SLS');    // Skill list
		wrapStandardFontSize(Window_EquipStatus, 'EQS');  // Equipment status
		wrapStandardFontSize(Window_ShopBuy, 'SBS');      // Shop buy window
		wrapStandardFontSize(Window_ShopSell, 'SSS');     // Shop sell window
		wrapStandardFontSize(Window_NameInput, 'NIS');    // Name input
		wrapStandardFontSize(Window_Options, 'OPS');      // Options menu
		wrapStandardFontSize(Window_SavefileList, 'SFL'); // Save-file list
		wrapStandardFontSize(Window_GameEnd, 'GES');      // Game quit menu
	} else { // MZ
		function wrapResetFontSettings(windowClass, fontSizeKey) {
			const originalMethod = windowClass.prototype.resetFontSettings;
			windowClass.prototype.resetFontSettings = function() {
				originalMethod.call(this);
				const fontSize = parseInt(LANGUAGE_MAPPING[ConfigManager.language][fontSizeKey] || 0);
				if (fontSize > 1)
					this.contents.fontSize = fontSize;
			};
		}
		wrapResetFontSettings(Window_Message, 'MFS');

		wrapResetFontSettings(Window_BattleLog, 'BFS');
		wrapResetFontSettings(Window_BattleStatus, 'BSS');
		wrapResetFontSettings(Window_BattleActor, 'BAS');
		wrapResetFontSettings(Window_BattleEnemy, 'BES');
		wrapResetFontSettings(Window_BattleSkill, 'BSK');
		wrapResetFontSettings(Window_BattleItem, 'BIS');

		wrapResetFontSettings(Window_Help, 'HFS');
		wrapResetFontSettings(Window_MenuStatus, 'MSS');
		wrapResetFontSettings(Window_Status, 'STS');
		wrapResetFontSettings(Window_ItemList, 'ILS');
		wrapResetFontSettings(Window_SkillList, 'SLS');
		wrapResetFontSettings(Window_EquipStatus, 'EQS');
		wrapResetFontSettings(Window_ShopBuy, 'SBS');
		wrapResetFontSettings(Window_ShopSell, 'SSS');
		wrapResetFontSettings(Window_NameInput, 'NIS');
		wrapResetFontSettings(Window_Options, 'OPS');
		wrapResetFontSettings(Window_SavefileList, 'SFL');
		wrapResetFontSettings(Window_GameEnd, 'GES');
	}
}

// Word wrapper for all languages
if (ENABLE_WORDWRAP) {
	const _Window_Message_newLineX = Window_Message.prototype.newLineX;
	Window_Message.prototype.newLineX = function () {
		let offsetX = _Window_Message_newLineX.call(this);
		if (offsetX === 0) offsetX += MARGIN;
		return offsetX;
	};

	if (MV_MODE) {
		const _processCharacter = Window_Base.prototype.processCharacter;
		const _needsNewPage = Window_Message.prototype.needsNewPage;

		//Game_Message.prototype.allText = function() {
			//return this._texts.join('\n').trim();
		//};

	Window_Message.prototype.isEndOfText = function(textState) {
		// avoid new empty message if the current one is at max lines and ending in \n
		if (textState.index >= textState.text.length - 4) {
			let index = textState.index;
			const enders = [' ', '\n'];
			while (index < textState.text.length && enders.contains(textState.text[index]))
				index++;
			return index >= textState.text.length;
		}
		return textState.index >= textState.text.length;
	};

		Window_Message.prototype.processCharacter = function(textState) {
			if (this.needsNewLine(textState)) {
				const currentChar = textState.text[textState.index];
				this.processNewLine(textState);
				if (currentChar !== ' ')
					textState.index--;
			}
			if (_needsNewPage.call(this, textState))
				textState.index--;

			_processCharacter.call(this, textState);
		};

	} else {
		const _Window_Message_shouldBreakHere = Window_Message.prototype.shouldBreakHere;
		Window_Message.prototype.shouldBreakHere = function(textState) {
			this.flushTextState(textState);
			if (this.needsNewLine(textState)) {
				this.processNewLine(textState);
				if (textState.text[textState.index] === ' ')
					textState.index++;
			}
			return _Window_Message_shouldBreakHere.call(this, textState);
		};
	}

	Window_Message.prototype.needsNewLine = function(textState) {
		const text = textState.text;
		const index = textState.index;
		const currentChar = text[index];
		const nextChar = text[index + 1];

		// Early return if current character should be ignored
		if (IGNORE_CHARS.indexOf(currentChar) !== -1 && IGNORE_CHARS.indexOf(nextChar) === -1)
			return false;

		const stringWidth = textState.x + this.textWidth(currentChar);
		const maxWidth = this.contentsWidth() - MARGIN;

		// Handle word wrapping for spaces
		if (currentChar === ' ') {
			let tillNextPoint = 0;
			const nextSpaceIndex = text.indexOf(' ', index + 1);
			const endIndex = nextSpaceIndex !== -1 ? nextSpaceIndex : text.length;
			const getWidth = this.textWidth.bind(this);
			for (let i = index + 1; i < endIndex; i++) {
				tillNextPoint += getWidth(text[i]);
				if (stringWidth + tillNextPoint > maxWidth)
					return true;
			}
		}
		return stringWidth > maxWidth;
	};
}

// Image translation wrapper
if (MV_MODE) {
	const _originalRequestImage = Bitmap.prototype._requestImage;
	Bitmap.prototype._requestImage = function (url) {
		//TRANSLATED_KEY check is there because of the recursive calls to _requestImage(url) with a previously set this._url
		const isLangSpritesheet = !!url.contains(LANGUAGES_PNG);
		const isDisabled = LANGUAGE_MAPPING[ConfigManager.language].disable && !isLangSpritesheet;
		const currentLng = isLangSpritesheet || isDisabled ? '' : ConfigManager.language;
		const translatedFilePath = !url.contains("/" + TRANSLATED_KEY + "/") ? url.replace(/^(.*\/)([^\/]+)$/, `$1${TRANSLATED_KEY}${currentLng}/$2`) : url;

		if (!isDisabled && fs.existsSync("www/" + translatedFilePath)) {
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

		const isLangSpritesheet = !!url.contains(LANGUAGES_PNG);
		const isDisabled = LANGUAGE_MAPPING[ConfigManager.language].disable && !isLangSpritesheet;
		const currentLng = isLangSpritesheet || isDisabled ? '' : ConfigManager.language;
		const translatedFilePath = this._url.replace(/^(.*\/)([^\/]+)$/, `$1${TRANSLATED_KEY}${currentLng}/$2`);

		if (!isDisabled && fs.existsSync(translatedFilePath)) {
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
	  "TorigoyaMZ_NotifyMessage": { "notify" : "message", "notifyWithVariableIcon" : "message" },
	  "DTextPicture" : { "dText" : "text" }
	};
});

})();