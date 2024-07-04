## filetranslate RPG Maker MV plugin

### Plugin for automatic translation of game texts

This RPG Maker MV plugin uses either a combined translation dictionary from `data/_combined.csv`, which uses `\n` as a replacement for newlines, or separate translations for each data JSON from `data/{JSON name without extension}_{strings|attributes}.csv`, both with `source→translation[→context]` format.

*NOTE*: Arrows (`→`), newlines and the escape character itself can be escaped with `¶` character.

If you want to translate images, just add their unencrypted translations to the `translated` subdirectory of the same directory as the original image.

Plugin parameters:  

* `Whole Script Lines`: Specifies how to handle script translations.  
     * `true` Replace scripts by the entire line (recommended).  
     * `false` Replace only the text inside the `"`/`'` marks.  
 * `Ignore Rare`: Specifies how to handle uncommon parameters.
     * `true` Ignore codes that rarely contain displayed text (recommended).  
     * `false` Check all known codes with text.  
* `Replace Attribute Spaces`: Specifies how to handle plugin command text.
    * `true` Replace spaces with underscores (`_`) before sending them to the plugin. You'll need to modify it to revert this with `.replace('_', ' ')` manually.
    * `false` Send the translation as is.
* `Merged Translations`: Specifies where to search for merged translations CSV dictionary.
    * `<relative path>` Relative path to the file without `www`. If found per-file CSVs will be ignored.
    

### Command line tool

 `_filetranslate_MV_init.py` generates all necessary csv databases when run from the same directory as the Game.exe.
 
 The tool depends on the installed `filetranslate` module.