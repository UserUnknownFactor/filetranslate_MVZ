# -*- coding: utf-8 -*-
import json, os, re, argparse
from filetranslate.service_fn import read_csv_list, write_csv_list
from filetranslate.language_fn import is_in_language

GLOBAL_NAMES = []

def extract_quoted_strings(script_text):
    matches = re.findall(r'"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'', script_text)
    extracted_text = [match.strip('"').strip("'") for match in matches]
    extracted_text = list(filter(lambda a: is_in_language(a, 'JA'), extracted_text))
    return extracted_text

def parse_codes(page, name, no_rare_codes, stop_words):
    text_entries = []
    attributes = {}
    if 'list' in page:
        for command in page['list']:
            code = command['code']
            parameters = command['parameters']
            # Show Text
            if code == 101:
                name = parameters[0]
                global_name = GLOBAL_NAMES[parameters[1]] if parameters[1] < len(GLOBAL_NAMES) else name
                pass
            # Text data
            if code == 401:
                if parameters[0]:
                    # we can do f"{global_name}/{name}" for precision too
                    text_entries.append([parameters[0], '', global_name])
            # Script code
            elif code == 355:
                if any(w in parameters[0] for w in stop_words):
                    continue
                scripts = extract_quoted_strings(parameters[0])
                for script in scripts:
                    if script:
                        attributes[script] = ''
            # Comments and Extended Comments
            elif code in [108, 408]:
                if parameters[0]:
                    attributes[parameters[0]] = ''
            # Show Choices
            elif code == 102:
                for choice in parameters[0]:
                    if choice and isinstance(choice, str):
                        attributes[choice] = ''
            # Control Variables
            elif code == 122:
                if parameters[3] == 4:  # Script
                    script_variable = extract_quoted_strings(parameters[4])
                    if script_variable:
                        attributes[script_variable] = ''
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

def create_csv_files(input_folder, output_folder, no_rare_codes, stop_words):
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
            "Classes" in file_path or "Skills" in file_path or "Enemies" in file_path or "States" in file_path:                # Basic database objects (Actors, Armors, etc.)
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
    parser.add_argument('-i', '--input_folder', default='.\\www\\data', help='Folder containing RPG Maker MV JSON data files.')
    parser.add_argument('-o', '--output_folder', default='.\\www\\data', help='Folder to save the translation CSV files.')
    parser.add_argument('-r', '--no_rare_codes', action='store_true', help='Enalbe rarely used codes (pollutes text if not used).')
    parser.add_argument('-s', '--stop_words', default='live2d', help='Comma separated list of excluded word seen in scripts.')

    args = parser.parse_args()

    if not os.path.exists(args.output_folder):
        os.makedirs(args.output_folder)

    stop_words = [w.strip() for w in args.stop_words.split(',')] if args.stop_words else []
    create_csv_files(args.input_folder, args.output_folder, args.no_rare_codes, stop_words)
    print(f'Translation files have been created in {args.output_folder}')

if __name__ == "__main__":
    main()