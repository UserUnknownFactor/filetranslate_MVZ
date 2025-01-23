## filetranslate RPG Maker MV/MZ plugin

### Plugin for translation of game texts from plain text DSV databases

This RPG Maker MV/MZ plugin uses either a combined translation dictionary from `data/_combined.csv`, which uses `\n` as a replacement for newlines, or separate translations for each attribute and separate text line of data JSON from `data/{JSON name without extension}_{strings|attributes}.csv`, both with `source→translation[→context]` arrow separated format.

*NOTES*: 
* Arrows (`→`), newlines and the escape character itself can be escaped with `¶` character.
* Rows can be commented out by placing `//` before their original (this is ignored if the translation also starts with `//`).

If you want to translate images, just add their unencrypted translations to the `translated` subdirectory of the same directory as the original image.

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

#### Manual adding of the plugin:

Add this line to `[www\]js\plugins.js` file before the last `];` :  
```
{"name":"_filetranslate_MVZ","status":true,"description":"Translation plugin","parameters":{"Whole Script Lines":"false"}},
```

### Command line tool

 `_filetranslate_MVZ_init.py` generates all necessary DSV databases when run from the same directory as the Game.exe.
 
 The tool depends on the installed `filetranslate` [module](https://github.com/UserUnknownFactor/filetranslate).