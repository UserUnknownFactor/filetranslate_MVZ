# -*- coding: utf-8 -*-
import json, os, re, argparse, difflib
from types import NoneType
from filetranslate.service_fn import read_csv_dict, read_csv_list, write_csv_list
from filetranslate.language_fn import is_in_language

GLOBAL_NAMES = []
MZ_MODE = not os.path.isdir(".\\www")
LINE_MERGE_CHARACTER = '' #'\n' # NOTE: set to '\n' to create multiline originals
ADD_EVENT_NAMES = False # NOTE: usually this is not needed, so JIC
REMOVE_TL_LINEBREAKS = ' ' # NOTE: set this to None to keep TL linebreaks as is

MZ_PLUGIN_DATA = {
#   "Plugin name": {"Command name": "Name of the argument with text to be replaced"}
    "TextPicture": {"set": "text"},
    "DestinationWindow": {"SET_DESTINATION": "destination"},
    "TorigoyaMZ_NotifyMessage": {"notify": "message", "notifyWithVariableIcon": "message"}
}

DIGIT_CLEANUP = str.maketrans('', '', '-,.')
def looks_digit(s):
    return s.translate(DIGIT_CLEANUP).isdigit()

def levenshtein_distance(str1, str2):
    """Computes the Levenshtein distance between two strings"""
    m = len(str1)
    n = len(str2)
    dp = [[0 for _ in range(n + 1)] for _ in range(m + 1)]
 
    for i in range(m + 1):
        dp[i][0] = i
    for j in range(n + 1):
        dp[0][j] = j
 
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if str1[i - 1] == str2[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]
            else:
                dp[i][j] = 1 + min(dp[i][j - 1], dp[i - 1][j], dp[i - 1][j - 1])
 
    return dp[m][n]

def similarity_score(s1, s2):
    max_len = max(len(s1), len(s2))
    if max_len == 0:
        return 100
    distance = levenshtein_distance(s1, s2)
    return (1 - distance / max_len) * 100

def extract_quoted_strings(script_text):
    matches = re.findall(r'([\"\'])((?:\\\1|.)*?)\1', script_text)
    extracted_text = [match[1] for match in matches if match and len(match)>1]
    extracted_text = list(filter(lambda a: is_in_language(a, 'JA'), extracted_text))
    return extracted_text

def get_next_code(command_list, i):
    return None if i+1 >= len(command_list) else command_list[i+1]['code']

def parse_codes(original_page, translated_page, name, no_rare_codes, stop_words, merge_lines):
    text_entries = []
    attributes = {}
    has_original = 'list' in original_page
    has_translation = 'list' in translated_page if translated_page else False
    parsed_codes = (101, 102, 108, 122, 355, 356, 357, 401, 405, 408)

    def get_full_text(command_list, start_index):
        full_text = [command_list[start_index]['parameters'][0]]
        i = start_index + 1
        while i < len(command_list) and command_list[i]['code'] in (401, 405):
            full_text.append(command_list[i]['parameters'][0])
            i += 1
        return full_text, i

    if has_original and has_translation:
        def command_to_hashable(command):
            return (command['code'], tuple([p for p in command['parameters'] if isinstance(
                p, (str, int, NoneType))]) if command['code'] not in parsed_codes else ())

        def is_junk(command):
            return command[0] in parsed_codes

        original_commands = [command_to_hashable(command) for command in original_page['list']]
        translated_commands = [command_to_hashable(command) for command in translated_page['list']]
        sm = difflib.SequenceMatcher(None, original_commands, translated_commands)

    if has_original:
        command_list = original_page['list']
        tr_command_list = translated_page.get('list', []) if has_translation else []
        i = 0
        while i < len(command_list):
            command = command_list[i]
            code = command['code']
            if code not in parsed_codes:
                i += 1
                continue

            global_name = ''
            params = command['parameters']
            tr_params = None

            if has_translation:
                for tag, i1, i2, j1, j2 in sm.get_opcodes():
                    if i1 <= i < i2:
                        if tag in ('replace', 'equal'):
                            tr_index = j1 + (i - i1)
                            if tr_index < len(tr_command_list):
                                tr_command = tr_command_list[tr_index]
                                if tr_command['code'] == code:
                                    tr_params = tr_command['parameters']
                        break

            if code == 101:  # Show Text
                name = params[0]
                if GLOBAL_NAMES:
                    global_name = GLOBAL_NAMES[params[1]] if params[1] < len(GLOBAL_NAMES) else name
            elif code == 102:  # Show Choices
                for choice in params[0]:
                    if choice and isinstance(choice, str):
                        tr_choice = tr_params[0][params[0].index(choice)] if tr_params else ''
                        attributes[choice] = tr_choice
            elif code == 122:  # Control Variables
                if params[3] == 4:  # Script
                    scripts = extract_quoted_strings(params[4])
                    tr_scripts = extract_quoted_strings(tr_params[4]) if tr_params else [''] * len(scripts)
                    for s, tr_s in zip(scripts, tr_scripts):
                        if s:
                            attributes[s] = tr_s
            elif code in (401, 405):  # Text data
                current_lines, end_index = get_full_text(command_list, i)
                if has_translation and tr_params:
                    tr_current_lines, _ = get_full_text(tr_command_list, tr_index)
                else:
                    tr_current_lines = [''] * len(current_lines)

                if merge_lines:
                    current_text = LINE_MERGE_CHARACTER.join(current_lines)
                    tr_current_text = LINE_MERGE_CHARACTER.join(tr_current_lines)
                    if current_text:
                        if REMOVE_TL_LINEBREAKS is not None:
                            tr_current_text = tr_current_text.replace('\n', REMOVE_TL_LINEBREAKS)
                        text_entries.append([current_text, tr_current_text, global_name])
                    i = end_index
                else:
                    for current_line, tr_current_line in zip(current_lines, tr_current_lines):
                        if current_line:
                            if REMOVE_TL_LINEBREAKS is not None:
                                tr_current_line = tr_current_line.replace('\n', REMOVE_TL_LINEBREAKS)
                            text_entries.append([current_line, tr_current_line, global_name])
                    i += len(current_lines) - 1
                continue
            elif code == 355:  # Script code
                if no_rare_codes:
                    i += 1
                    continue
                if any(w in params[0] for w in stop_words):
                    continue
                scripts = extract_quoted_strings(params[0])
                tr_scripts = extract_quoted_strings(tr_params[0]) if tr_params else [''] * len(scripts)
                for s, tr_s in zip(scripts, tr_scripts):
                    if s:
                        attributes[s] = tr_s
            elif code == 356:  # Plugin call
                if any(w in params[0] for w in stop_words):
                    i += 1
                    continue
                split_params = re.split(r'\s+', params[0])
                if len(split_params) > 1 and split_params[1] and not looks_digit(
                        split_params[1]) and "_" not in split_params[1]:
                    tr_split_params = tr_params[0].split(' ') if tr_params else []
                    attributes[split_params[1]] = tr_split_params[1] if len(tr_split_params) > 1 else ''
            elif code == 357:  # Plugin call MZ
                if any(w in params[0] for w in stop_words) or len(params) < 4:
                    i += 1
                    continue
                for k, v in MZ_PLUGIN_DATA.items():
                    if k == params[0] and params[1] in v:
                        command_key = v[params[1]]
                        a = params[3][command_key]
                        if a and not looks_digit(a):
                            tr_a = tr_params[3][command_key] if tr_params and len(tr_params) > 3 else ''
                            attributes[a] = tr_a
            elif code in (108, 408):  # Comments and Extended Comments
                if no_rare_codes:
                    i += 1
                    continue
                if params[0]:
                    tr_param = tr_params[0] if tr_params else ''
                    attributes[params[0]] = tr_param
            i += 1
    return text_entries, attributes

def parse_pages(original_event, translated_event, no_rare_codes, stop_words, merge_lines=False):
    def page_to_hashable(page):
        return (
            tuple(page.get('conditions', {}).values()),
            page.get('image', {}).get('characterName', ''),
            page.get('image', {}).get('characterIndex', -1)
        )

    strings = []
    attributes = {}
    character_name = original_event['image']['characterName'] if (
        'image' in original_event) and 'characterName' in original_event['image'] else ''

    if 'pages' in original_event:
        original_pages = [page_to_hashable(page) for page in original_event['pages']]
        translated_pages = []
        if (translated_event and 'pages' in translated_event):
            translated_pages = [page_to_hashable(page) for page in translated_event['pages']]

        if translated_pages:
            sm = difflib.SequenceMatcher(None, original_pages, translated_pages)
            for tag, i1, i2, j1, j2 in sm.get_opcodes():
                if tag in ('replace', 'equal'):
                    for i in range(i1, i2):
                        original_page = original_event['pages'][i]
                        translated_page = translated_event['pages'][i - i1 + j1] if (
                            i - i1 + j1 < len(translated_event['pages'])) else {}
                        strs, attrs = parse_codes(original_page, translated_page, character_name,
                                                  no_rare_codes, stop_words, merge_lines)
                        strings.extend(strs)
                        attributes |= attrs
                elif tag == 'insert':
                    for j in range(j1, j2):
                        translated_page = translated_event['pages'][j]
                        strs, attrs = parse_codes(translated_page, [], character_name,
                                                  no_rare_codes, stop_words, merge_lines)
                        strings.extend(strs)
                        attributes |= attrs
        else:
            for original_page in original_event['pages']:
                strs, attrs = parse_codes(original_page, {}, character_name,
                                          no_rare_codes, stop_words, merge_lines)
                strings.extend(strs)
                attributes |= attrs

    return strings, attributes

def event_to_hashable(event):
    if not event:
        return tuple()
    return (
        event.get('name', ''),
        event.get('id', -1),
        tuple(page.get('conditions', {}).get('switch1Id', -1) for page in event.get('pages', []))
    )

def parse_events_list(original_data, translated_data, no_rare_codes, stop_words, merge_lines=False):
    strings = []
    attributes = {}

    def item_to_hashable(item):
        if not item: return ()
        return tuple(item.get(attr, '') for attr in ['name', 'id'])

    original_items = [item_to_hashable(item) for item in original_data]
    translated_items = [item_to_hashable(item) for item in translated_data] if translated_data else []

    if translated_items:
        sm = difflib.SequenceMatcher(None, original_items, translated_items)
        for tag, i1, i2, j1, j2 in sm.get_opcodes():
            if tag in ('replace', 'equal'):
                for i in range(i1, i2):
                    original_event = original_data[i]
                    if not original_event: continue
                    translated_event = translated_data[i - i1 + j1] if i - i1 + j1 < len(translated_data) else {}
                    strs, attrs = parse_codes(original_event, translated_event, original_event['name'],
                                              no_rare_codes, stop_words, merge_lines)
                    if ADD_EVENT_NAMES and "name" in original_event:
                        attributes |= {original_event["name"]: translated_event["name"]}
                    strings.extend(strs)
                    attributes |= attrs
            elif tag == 'insert':
                for j in range(j1, j2):
                    translated_event = translated_data[j] if j < len(translated_data) else {}
                    if not translated_event: continue
                    strs, attrs = parse_codes(translated_event, [], translated_event['name'], no_rare_codes,
                                              stop_words, merge_lines)
                    strings.extend(strs)
                    if ADD_EVENT_NAMES and "name" in translated_event:
                        attributes |= {translated_event["name"]:''}
                    attributes |= attrs
    else:
        for original_event in original_data:
            if not original_event: continue
            strs, attrs = parse_codes(original_event, {}, original_event['name'],
                                      no_rare_codes, stop_words, merge_lines)
            if ADD_EVENT_NAMES and "name" in original_event:
                attributes |= {original_event["name"]:''}
            strings.extend(strs)
            attributes |= attrs

    return strings, attributes

def parse_map_events(original_data, translated_data, no_rare_codes, stop_words, merge_lines=False):
    strings = []
    attributes = {}

    if 'events' in original_data:
        original_events = [event_to_hashable(event) for event in original_data['events']]
        translated_events = []
        if 'events' in translated_data:
            translated_events = [event_to_hashable(event) for event in translated_data['events']]

        if translated_events:
            sm = difflib.SequenceMatcher(None, original_events, translated_events)
            for tag, i1, i2, j1, j2 in sm.get_opcodes():
                if tag in ('replace', 'equal'):
                    for i in range(i1, i2):
                        original_event = original_data['events'][i]
                        if original_event:
                            translated_event = translated_data['events'][i - i1 + j1] if (
                                'events' in translated_data) and i - i1 + j1 < len(
                                translated_data['events']) else None
                            strs, attrs = parse_pages(original_event, translated_event, no_rare_codes,
                                                      stop_words, merge_lines)
                            if ADD_EVENT_NAMES and "name" in original_event:
                                attributes |= {original_event["name"]: translated_event["name"]}
                            strings.extend(strs)
                            attributes |= attrs
                elif tag == 'insert':
                    for j in range(j1, j2):
                        translated_event = translated_data['events'][j] if (
                            'events' in translated_data) and j < len(
                            translated_data['events']) else None
                        strs, attrs = parse_pages(translated_event, None, no_rare_codes,
                                                  stop_words, merge_lines)
                        if ADD_EVENT_NAMES and "name" in translated_event:
                            attributes |= {translated_event["name"]: ''}
                        strings.extend(strs)
                        attributes |= attrs
        else:
            for original_event in original_data['events']:
                if original_event:
                    strs, attrs = parse_pages(original_event, None, no_rare_codes,
                                              stop_words, merge_lines)
                    if ADD_EVENT_NAMES and "name" in original_event:
                        attributes |= {original_event["name"]:''}
                    strings.extend(strs)
                    attributes |= attrs

    return strings, attributes

def parse_array_attributes(obj, tr_obj, attrs=[], no_rare_codes=False, dump_all=False):
    attributes = {}
    if dump_all:
        for i in obj:
            if obj[i]:
                tr_value = tr_obj.get(i, '') if tr_obj else ''
                attributes[obj[i]] = [tr_value, i]
    else:
        for prop in attrs:
            if no_rare_codes and prop == 'note': continue
            if prop in obj and obj[prop]:
                for i, value in enumerate(obj[prop]):
                    if value:
                        tr_value = tr_obj.get(prop, [])[i] if tr_obj and prop in tr_obj else ''
                        attributes[value] = [tr_value, prop]
    return attributes

def parse_attributes(data, tr_data, attrs=[], no_rare_codes=False, is_list=False, all=False):
    attributes = {}

    def item_to_hashable(item):
        if not item: return ()
        return tuple(item.get(attr, '') for attr in attrs)

    original_items = [item_to_hashable(item) for item in data]
    translated_items = [item_to_hashable(item) for item in tr_data] if tr_data else []

    if translated_items:
        sm = difflib.SequenceMatcher(None, original_items, translated_items)
        for tag, i1, i2, j1, j2 in sm.get_opcodes():
            if tag in ('replace', 'equal'):
                for i in range(i1, i2):
                    obj = data[i]
                    tr_obj = tr_data[i - i1 + j1] if i - i1 + j1 < len(tr_data) else {}
                    if not obj: continue
                    for prop in attrs:
                        comment = prop
                        if prop == 'note':
                            if no_rare_codes: continue
                        if 'name' in obj:
                            comment += '/' + obj['name']
                        if 'id' in obj:
                            comment += '/' + obj['id']
                        if prop in obj and obj[prop]:
                            tr_value = tr_obj.get(prop, '') if tr_obj else ''
                            attributes[obj[prop]] = [tr_value, comment]
    else:
        for obj in data:
            if not obj: continue
            for prop in attrs:
                comment = prop
                if prop == 'note':
                    if no_rare_codes: continue
                if 'name' in obj:
                    comment += '/' + obj['name']
                if 'id' in obj:
                    comment += '/' + obj['id']
                if prop in obj and obj[prop]:
                    attributes[obj[prop]] = ['', comment]

    return attributes

def load_translations(translations_folder):
    translations = {}
    if os.path.exists(translations_folder):
        for file_name in os.listdir(translations_folder):
            if file_name.endswith('.json'):
                file_path = os.path.join(translations_folder, file_name)
                with open(file_path, 'r', encoding='utf-8-sig') as file:
                    try:
                        translations[file_name] = json.load(file)
                    except e:
                        print(f"Error in {file_name}!!\n{e}")
                        raise
    return translations

def create_csv_files(input_folder, output_folder, no_rare_codes, stop_words, merge_lines, translation_folder):
    pretranslated_dict = {}
    global GLOBAL_NAMES

    def write_attributes(name, data, pretranslated_dict):
        if data:
            csv_name = os.path.splitext(name)[0] + '_attributes.csv'
            csv_path = os.path.join(output_folder, csv_name)
            attrs = [[k, v[0], v[1]] if isinstance(v, list) else [k, v] for k, v in data.items() if k]
            existing_data = read_csv_dict(csv_path) # read the existing translations
            pretranslated_dict.update(existing_data)
            for i, row in enumerate(attrs):
                if row[0] in pretranslated_dict:
                    attrs[i][1] = pretranslated_dict[row[0]]
            write_csv_list(csv_path, attrs)
            print(f" Created {os.path.relpath(csv_path)} with {len(attrs)} attributes")

    pretranslated = read_csv_list(os.path.join(input_folder, '_combined.csv'))
    for row in pretranslated:
        texts = row[0].split('\\n')
        text_tls = row[1].split('\\n')
        for i, line in enumerate(texts):
            pretranslated_dict[line] = text_tls[i] if i < len(text_tls) else ''
    if not pretranslated:
        pretranslated = {}

    translated_fully = load_translations(translation_folder)
    if not translated_fully:
        translated_fully = {}

    file_path = os.path.join(input_folder, 'Actors.json')
    if os.path.isfile(file_path):
        with open(file_path, 'r', encoding='utf-8-sig') as file:
            try:
                data = json.load(file)
            except e:
                print(f"Error in {file_name}!!\n{e}")
                raise
            tr_data = translated_fully.get('Actors.json', [])
            attrs = parse_attributes(
                data, tr_data,
                ['name', 'nickname', 'profile', 'note', 'description',
                'message1', 'message2', 'message3', 'message4'])
            GLOBAL_NAMES = [n for n in parse_attributes(data, tr_data, ['name']).keys()]
            write_attributes('Actors.json', attrs, pretranslated_dict)

    for file_name in os.listdir(input_folder):
        if file_name.endswith('.json') and file_name != 'Actors.json':
            print(f"Parsing {file_name}...")
            file_path = os.path.join(input_folder, file_name)
            if "Actors" in file_path: continue
            if not os.path.isfile(file_path): continue
            with open(file_path, 'r', encoding='utf-8-sig') as file:
                try:
                    data = json.load(file)
                except e:
                    print(f"Error in {file_name}!!\n{e}")
                    continue

            tr_data = translated_fully.get(file_name, {})
            strs = attrs = None

            # Determine the type of data and extract relevant information
            if "Armors" in file_path or "Items" in file_path or "Weapons" in file_path or \
            "Classes" in file_path or "Skills" in file_path or "Enemies" in file_path or "States" in file_path:
                # Basic database objects (Actors, Armors, etc.)
                attrs = parse_attributes(
                    data, tr_data,
                    ['name', 'nickname', 'profile', 'note', 'description',
                     'message1', 'message2', 'message3', 'message4'])
            elif "System" in file_path:
                # System data
                attrs = parse_attributes([data], [tr_data], ['gameTitle'])
                attrs |= parse_array_attributes(
                    data, tr_data,
                    ['armorTypes', 'elements', 'equipTypes',
                     'skillTypes', 'weaponTypes']
                )
                attrs |= parse_array_attributes(data['terms'], tr_data.get(
                    'terms', {}), ['basic', 'commands', 'params'])
                attrs |= parse_array_attributes(data['terms']['messages'], tr_data.get(
                    'terms', {}).get('messages', {}), dump_all=True)
            elif "Troops" in file_path:
                # Troop data
                _, attrs = parse_events_list(data, tr_data, False, [])
            elif "Events" in file_path:
                # Event data
                strs, attrs = parse_events_list(data, tr_data, no_rare_codes, stop_words, merge_lines)
            elif re.compile(r'Map\d+').search(file_path):
                # Map data
                attrs = {data['displayName']: tr_data.get('displayName', '')}
                strs, attrs1 = parse_map_events(data, tr_data, no_rare_codes, stop_words, merge_lines)
                attrs |= attrs1

            # Create strings CSV
            if strs:
                csv_name = os.path.splitext(file_name)[0] + '_strings.csv'
                csv_path = os.path.join(output_folder, csv_name)
                for i, row in enumerate(strs):
                    if row[0] in pretranslated_dict:
                        strs[i][1] = pretranslated_dict[row[0]]

                strs_old = read_csv_list(csv_path) # read the old existing string translation
                for i, row_i in enumerate(strs):
                    for j, row_j in enumerate(strs_old):
                        if row_i[0] == row_j[0]:
                            strs[i][1] = row_j[1]
                            strs_old.pop(j)
                            break
                for i, row_i in enumerate(strs):
                    if not strs[i][1]: 
                        best_match = None
                        best_score = 0
                        best_index = -1
                        for j, row_j in enumerate(strs_old):
                            score = similarity_score(row_i[0], row_j[0])
                            if score > best_score:
                                best_match = row_j
                                best_score = score
                                best_index = j
                        if best_match and best_score > 80:
                            strs[i][1] = best_match[1]
                            strs_old.pop(best_index)

                write_csv_list(csv_path, strs)
                print(f" Created {os.path.relpath(csv_path)} with {len(strs)} strings")
            # Create attributes CSV
            write_attributes(file_name, attrs, pretranslated_dict)

def main():
    parser = argparse.ArgumentParser(
        description='Extract text and attributes for translation from RPG Maker MV data files.')
    parser.add_argument('-i', '--input-folder', default=(
                        '.\\data' if MZ_MODE else '.\\www\\data'),
                        help='folder containing RPG Maker MV JSON data files.')
    parser.add_argument('-o', '--output-folder', default=(
                        '.\\data' if MZ_MODE else '.\\www\\data'),
                        help='folder to save the translation CSV files.')
    parser.add_argument('-r', '--rare-codes', action='store_true',
                        help='enable rarely used codes (pollutes texts if unused).')
    parser.add_argument('-s', '--stop-words', default='live2d,audiosource',
                        help='comma separated list of exclusion words for text in scripts.')
    parser.add_argument('-p', '--preserve-lines', action='store_true',
                        help='preserve multi-line dialogues as single lines.')
    parser.add_argument('-t', '--translations-folder', default=(
                        '.\\data1' if MZ_MODE else '.\\www1\\data'),
                        help='folder containing translated JSON data files.')

    args = parser.parse_args()

    if not os.path.exists(args.output_folder):
        os.makedirs(args.output_folder)

    stop_words = [w.strip() for w in args.stop_words.split(',') if w] if args.stop_words else []
    create_csv_files(args.input_folder, args.output_folder, not args.rare_codes, stop_words,
                     not args.preserve_lines, args.translations_folder)
    print(f'Translation files have been created in {args.output_folder}')

if __name__ == "__main__":
    main()