# -*- coding: utf-8 -*-
import json, os, re, argparse
from filetranslate.service_fn import read_csv_list, write_csv_list
from filetranslate.language_fn import is_in_language

GLOBAL_NAMES = []
MZ_MODE = not os.path.isdir(".\\www")
MZ_PLUGIN_DATA = {
#   "Plugin name": {"Command name": "Argument name with text to be replaced"}
    "TextPicture": {"set" : "text" },
    "DestinationWindow": { "SET_DESTINATION": "destination" },
    "TorigoyaMZ_NotifyMessage": { "notify": "message", "notifyWithVariableIcon": "message" }
}

DIGIT_CLEAUNUP = str.maketrans('', '', '-,.')
def looks_digit(s):
    return s.translate(DIGIT_CLEAUNUP).isdigit()

def extract_quoted_strings(script_text):
    matches = re.findall(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'', script_text)
    extracted_text = [match.strip('"').strip("'") for match in matches]
    extracted_text = list(filter(lambda a: is_in_language(a, 'JA'), extracted_text))
    return extracted_text

def parse_codes(page, name, no_rare_codes, stop_words, merge_lines):
    text_entries = []
    #attributes = {name: ''}
    attributes = {}
    if 'list' in page:
        for command in page['list']:
            global_name = ''
            code = command['code']
            params = command['parameters']

            if code == 101: # Show Text
                name = params[0]
                if GLOBAL_NAMES:
                    global_name = GLOBAL_NAMES[params[1]] if params[1] < len(GLOBAL_NAMES) else name
                pass
            elif code == 102: # Show Choices
                for choice in params[0]:
                    if choice and isinstance(choice, str):
                        attributes[choice] = ''
            elif code == 122: # Control Variables
                if params[3] == 4:  # Script
                    scripts = extract_quoted_strings(params[4])
                    for s in scripts:
                        if s: attributes[s] = ''
            if code in (401, 405): # Text data
                if params[0]:
                    # we can do f"{global_name}/{name}" for precision too
                    text_entries.append([params[0], '', global_name])
            elif code == 355: # Script code
                if no_rare_codes: continue
                if any(w in params[0] for w in stop_words):
                    continue
                scripts = extract_quoted_strings(params[0])
                for s in scripts:
                    if s: attributes[s] = ''
            elif code == 356: # Plugin call
                if any(w in params[0] for w in stop_words):
                    continue
                split_params = params[0].split(' ')
                if len(split_params) > 1 and split_params[1] and not looks_digit(split_params[1]) and "_" not in split_params[1]:
                    attributes[split_params[1]] = ''
            elif code == 357: # Plugin call MZ
                if any(w in params[0] for w in stop_words) or len(params) < 4:
                    continue
                for k, v in MZ_PLUGIN_DATA.items():
                    if k == params[0] and params[1] in v:
                        commandKey = v[params[1]]
                        a = params[3][commandKey]
                        if a and not looks_digit(a):
                            attributes[a] = ''
            elif code in (108, 408): # Comments and Extended Comments
                if no_rare_codes: continue
                if params[0]:
                    attributes[params[0]] = ''
    return text_entries, attributes

def parse_pages(event, no_rare_codes, stop_words):
    strings = []
    attributes = {}
    character_name = event['image']['characterName'] if 'image' in event and 'characterName' in event['image'] else ''
    for page in event['pages']:
        strs, attrs = parse_codes(page, character_name, no_rare_codes, stop_words)
        strings.extend(strs)
        attributes |= attrs
    return strings, attributes

def parse_events_list(data, no_rare_codes, stop_words):
    strings = []
    attributes = {}
    for page in data:
        if not page: continue
        strs, attrs = parse_codes(page, page['name'], no_rare_codes, stop_words)
        strings.extend(strs)
        attributes |= attrs
    return strings, attributes

def parse_map_events(data, no_rare_codes, stop_words):
    strings = []
    attributes = {}
    if 'events' in data:
        for events in data['events']:
            if not events: continue
            strs, attrs =  parse_pages(events, no_rare_codes, stop_words)
            strings.extend(strs)
            attributes |= attrs
    return strings, attributes

def parse_array_attributes(obj, attrs=[], no_rare_codes=False, dump_all=False):
    attributes = {}
    if dump_all:
        for i in obj:
            if obj[i]:
                attributes[obj[i]] = ['', i]
    else:
        for prop in attrs:
            if no_rare_codes and prop == 'notes': continue
            if prop in obj and obj[prop]:
                for i in obj[prop]:
                    if i: attributes[i] = ['', prop]
    return attributes

def parse_attributes(data, attrs=[], no_rare_codes=False, is_list=False, all=False):
    attributes = {}
    for obj in data:
        if not obj: continue
        for prop in attrs:
            comment = prop
            if prop == 'note':
                if no_rare_codes: continue
                if 'name' in obj:
                    comment += '/' + obj['name']
            if prop in obj and obj[prop]:
                attributes[obj[prop]] = ['', comment]
    return attributes

def create_csv_files(input_folder, output_folder, no_rare_codes, stop_words, merge_lines):
    def write_attributes(name, data):
        if data:
            csv_name = os.path.splitext(name)[0] + '_attributes.csv'
            csv_path = os.path.join(output_folder, csv_name)
            attrs = [[k, v[0], v[1]] if isinstance(v, list) else [k, v] for k,v in data.items() if k]
            for i, row in enumerate(attrs):
                if row[0] in pretranslated_dict:
                    attrs[i][1] = pretranslated_dict[row[0]]
            write_csv_list(csv_path, attrs)

    global GLOBAL_NAMES

    pretranslated = read_csv_list(os.path.join(input_folder, '_combined.csv'))
    pretranslated_dict = {}
    for row in pretranslated:
        texts = row[0].split('\\n')
        text_tls = row[1].split('\\n')
        for i, line in enumerate(texts):
            pretranslated_dict[line] = text_tls[i] if i < len(text_tls) else ''
    if not pretranslated:
        pretranslated = {}


    file_path = os.path.join(input_folder, 'Actors.json')
    with open(file_path, 'r', encoding='utf-8') as file:
        data = json.load(file)
        attrs = parse_attributes(data, ['name', 'nickname', 'profile', 'note', 'description',
                                'message1', 'message2', 'message3', 'message4'])
        GLOBAL_NAMES = [n for n in parse_attributes(data, ['name']).keys()]
        write_attributes('Actors.json', attrs)

    for file_name in os.listdir(input_folder):
        if file_name.endswith('.json'):
            file_path = os.path.join(input_folder, file_name)
            if "Actors" in file_path: continue
            with open(file_path, 'r', encoding='utf-8') as file:
                try:
                    data = json.load(file)
                except:
                    continue
            strs = attrs = None

            # Determine the type of data and extract relevant information
            if "Armors" in file_path or "Items" in file_path or "Weapons" in file_path or \
            "Classes" in file_path or "Skills" in file_path or "Enemies" in file_path or "States" in file_path:
                # Basic database objects (Actors, Armors, etc.)
                attrs = parse_attributes(data, ['name', 'nickname', 'profile', 'note', 'description',
                                        'message1', 'message2', 'message3', 'message4'])
            elif "System" in file_path:
                # System data
                attrs = parse_attributes([data], ['gameTitle'])
                attrs |= parse_array_attributes(data, ['armorTypes', 'elements', 'equipTypes', 'skillTypes', 'weaponTypes'])
                if (not no_rare_codes):
                    attrs |= parse_array_attributes(data['terms'], ['basic', 'commands', 'params'])
                    attrs |= parse_array_attributes(data['terms']['messages'], dump_all=True)
            elif "Troops" in file_path:
                # Troop data
                _, attrs = parse_events_list(data, False, [])
            elif "Events" in file_path:
                # Event data
                strs, attrs = parse_events_list(data, no_rare_codes, stop_words)
            elif re.compile(r'Map\d+').search(file_path):
                # Map data
                attrs = {data['displayName']: ''}
                strs, attrs1 = parse_map_events(data, no_rare_codes, stop_words)
                attrs |= attrs1

            # Create strings CSV
            if strs:
                csv_name = os.path.splitext(file_name)[0] + '_strings.csv'
                csv_path = os.path.join(output_folder, csv_name)
                for i, row in enumerate(strs):
                    if row[0] in pretranslated_dict:
                        strs[i][1] = pretranslated_dict[row[0]]
                write_csv_list(csv_path, strs)
            # Create attributes CSV
            write_attributes(file_name, attrs)

def main():
    parser = argparse.ArgumentParser(description='Extract text and attributes for translation from RPG Maker MV data files.')
    parser.add_argument('-i', '--input-folder', default=('.\\data' if MZ_MODE else '.\\www\\data'), help='folder containing RPG Maker MV JSON data files.')
    parser.add_argument('-o', '--output-folder', default=('.\\data' if MZ_MODE else '.\\www\\data'), help='folder to save the translation CSV files.')
    parser.add_argument('-r', '--rare-codes', action='store_true', help='enable rarely used codes (pollutes texts if unused).')
    parser.add_argument('-s', '--stop-words', default='live2d,audiosource', help='comma separated list of exclusion words for text in scripts.')
    parser.add_argument('-m', '--merge-lines', action='store_true', help='merge multi-line dialogues into a single line.')

    args = parser.parse_args()

    if not os.path.exists(args.output_folder):
        os.makedirs(args.output_folder)

    stop_words = [w.strip() for w in args.stop_words.split(',') if w] if args.stop_words else []
    create_csv_files(args.input_folder, args.output_folder, not args.rare_codes, stop_words, args.merge_lines)
    print(f'Translation files have been created in {args.output_folder}')

if __name__ == "__main__":
    main()