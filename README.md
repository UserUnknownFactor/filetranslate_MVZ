## filetranslate MV/MZ game translation plugin

### Plugin for translation of RPG Maker MV/MZ game texts from plain-text DSV databases

This plugin uses either a combined translation dictionary from `data/_combined[_languagecode].csv`, which uses `\n` as a replacement for newlines, or separate translations for each attribute and separate text line of data JSON from `data/{JSON name without extension}[_languagecode]_{strings|attributes}.csv`, both with `source→translation[→context]` arrow separated format.

If you want to translate images, just add their *unencrypted* translations to the `translated[_languagecode]` subdirectory in the same directory as the original image. Without [_languagecode] it'll be the default translation (English).

The language configuration option appears in Options menu. 

*NOTES*:  
* Arrows (`→`), newlines and the escape character itself can be escaped with `¶` character.  
* Rows can be commented out by placing `//` before their original (ignored if the translation starts with `//` too).  
* `_languagecode` is a 2-letter standard ISO code preceded by an underscore; currently only English (empty code) and Japanese (`_jp` code) are supported. Since the Python tool now creates only code-less files, the `_jp` code is considered the default language/untranslated.    
* To add a new, for example: `_ab` language, add it to `LANGUAGE_MAPPING` object, or to `Languages Data` plugin parameter, with `flagY` as y-coordinate anywhere within the desired flag in the `country_flags_32.png` spritesheet, and then put translated images in `translated_ab` and use csv files with the language code in them like `filename_ab_{strings|attributes}.csv` as described above.

#### Plugin parameters:  

* `Whole Script Lines`: Specifies how to handle script translations.  
     * `true` Replace scripts by the entire line (recommended).  
     * `false` Replace only the text inside the `"`/`'` marks.  
 * `Ignore Rare`: Specifies which uncommon parameters to ignore (see the plugin code for their meanings).  
    Default: `[402, 122, 111, 108, 408, 320, 324, 325, 655]`  
* `Replace Attribute Spaces`: Specifies how to handle plugin command text.  
    * `true` Replace spaces with underscores (`_`) before sending them to the plugin. You'll need to modify it to revert this with `.replace(/_/g, ' ')` manually.  
    * `false` Send the translation as is.  
* `Line-merge Character`: Specifies what character to use when merging text split across multiple text codes.  
    Default: `''` (empty string)  
* `Merged Translations`: Specifies where to search for a merged translations dictionary.  
    * `<relative path>` Relative path to the file without `www`. If it's found per-origin .csv files will be ignored.  
* `Default Language`: Specifies the default menu and translation language.  
    * `_<two-letter language code>` The code must be prepended with underscore.  
    Default: `''` (empty string)  
* `Ignored Characters`: Characters that cannot appear at the beginning of a line during word-wrapping.
    * `<string>` See its default value in the code.  
* `Text Margin`: Margin on the both sides of the message window during word-wrapping. If face image shown only right one is used.  
    Default: `10`  
* `Enable Wordwrap`: Allows the message window text to be wrapped within the visible area of the dialog box.  
     * `true` Enable simple word-wrapping (recommended for English).  
     * `false` Use no or external word-wrapper.   
* `Override Font Sizes`: Allows font size overriding based on corresponding Languages Data fields.  
     * `true` Override font sizes if there is a corresponding field filled.  
     * `false` Disable the entire functionality.
* `Languages Data`: Supported languages and their icons in the spritesheet object.  
    * `<JSON-encoded object>` See the object format in the code. 

#### Manual adding of the plugin:

Add this line to `[www\]js\plugins.js` file before the last `];` :  
```
{"name":"_filetranslate_MVZ","status":true,"description":"Translation plugin","parameters":{"Whole Script Lines":"false"}},
```

### Command line tool

 `_filetranslate_MVZ_init.py` generates all necessary DSV databases when run from the same directory as the Game.exe.
 If you want to retranslate some game based on a previous translation put it in `to_compare` subfolder preserving the directory structure so it'll try to match them.
 The format is compatible with `filetranslate` [translation tool](https://github.com/UserUnknownFactor/filetranslate).