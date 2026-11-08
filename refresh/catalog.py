"""Сборщик каталога. Исходная таблица доступна только для чтения."""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
from decimal import Decimal
import html
import json
import math
import os
from pathlib import Path
import re
import sys
import tempfile
import unicodedata
from urllib.parse import quote


ROOT = Path(__file__).resolve().parent
ERROR_VALUES = {'#N/A', '#REF!', '#VALUE!', '#DIV/0!', '#NAME?', '#NUM!', '#ERROR!', '#Н/Д', '#ССЫЛКА!', '#ЗНАЧ!'}
ITEM_FIELDS = {'art', 'tip', 'char2', 'proba', 'cvet', 'polnpust', 'kamni', 'marka', 'vstavka', 'naim', 'photo', 'sizes', 'stocks', 'units', 'details'}
OPTIONAL_ITEM_FIELDS = {'codes', 'stock_codes'}
FORBIDDEN = re.compile(r'цен(?:а|ы|у|е|ой|ами|ах)\b|себестоим\w*|марж\w*|нацен\w*|закуп\w*|\b(?:price|cost|margin|markup|purchase)\b', re.I)
TYPES = {x.casefold(): x for x in ('Кольцо', 'Серьги', 'Цепь', 'Браслет', 'Подвеска', 'Колье', 'Пирсинг', 'Брошь', 'Сувенир')}
KNOWN_STOCKS = {'Общий склад', 'Центральный склад', 'О.А.'}


class BuildError(Exception):
    """Ошибка, при которой прежний каталог остаётся нетронутым."""


def text(value):
    return '' if value is None else str(value).strip()


def unit_number(value, *, positive=False):
    """Only explicit unit facts; never derive retail amounts from other fields."""
    try:
        number = Decimal(text(value).replace(' ', '').replace('\u00a0', '').replace('\u202f', '').replace(',', '.').replace('₽', ''))
        if not number.is_finite() or number < 0 or (positive and number == 0):
            return None
        result = float(number)
        return result if math.isfinite(result) else None
    except (ArithmeticError, ValueError):
        return None


def unit_entry(record):
    entry = {'code': record['code'], 'size': record['size']}
    for field, value in (('grams', unit_number(record.get('weight'), positive=True)),
                         ('prc', unit_number(record.get('prc')))):
        if value is not None:
            entry[field] = value
    return entry


def event(log, kind, row=None, art='', **details):
    log.append({'kind': kind, **({'row': row} if row is not None else {}),
                **({'art': art} if art else {}), **details})


def resolve_headers(header, config):
    first = {}
    for index, title in enumerate(header):
        first.setdefault(text(title), index)
    required = dict(config['headers'])
    if config.get('stone_group_header'):
        required['kamni'] = config['stone_group_header']
    missing = [name for name in required.values() if name not in first]
    if missing:
        raise BuildError('Отсутствуют обязательные колонки: ' + ', '.join(missing) + '. Проверьте строку 1; каталог не обновлён.')
    columns = {key: first[name] for key, name in required.items()}
    for field, name in [('lock', 'Тип замка'), ('kamni', 'Группа вставки')]:
        if name in first and field not in columns: columns[field] = first[name]
    return columns


def column_name(index):
    name = ''
    index += 1
    while index:
        index, remainder = divmod(index - 1, 26)
        name = chr(65 + remainder) + name
    return name


def read_google(config):
    """Сначала заголовки, затем только разрешённые колонки одним batchGet."""
    from google.oauth2 import service_account
    from google.auth.transport.requests import AuthorizedSession
    raw = os.environ.get('GOOGLE_SERVICE_ACCOUNT_JSON', '')
    if not raw:
        raise BuildError('Не задан секрет GOOGLE_SERVICE_ACCOUNT_JSON.')
    try:
        key = json.loads(raw)
        if key.get('token_uri') != 'https://oauth2.googleapis.com/token':
            raise ValueError('Неверный адрес авторизации')
        credentials = service_account.Credentials.from_service_account_info(
            key, scopes=['https://www.googleapis.com/auth/spreadsheets.readonly'])
    except (ValueError, KeyError, TypeError):
        raise BuildError('Некорректный ключ. Сохраните в GitHub Secrets исходный JSON целиком.') from None
    base = 'https://sheets.googleapis.com/v4/spreadsheets/' + config['spreadsheet_id']
    tab = "'" + config['sheet'].replace("'", "''") + "'"
    with AuthorizedSession(credentials) as session:
        def get(url, params=None):
            try:
                response = session.get(url, params=params, timeout=90)
            except Exception:
                raise BuildError('Не удалось подключиться к Google. Повторите запуск.') from None
            if response.status_code != 200:
                raise BuildError(f'Google вернул HTTP {response.status_code}. Проверьте доступ Читатель, включение API и имя листа.')
            return response.json()
        header_range = quote(tab + '!1:1', safe='')
        header = get(base + '/values/' + header_range).get('values', [[]])[0]
        columns = resolve_headers(header, config)
        indexes = sorted(set(columns.values()))
        params = [('valueRenderOption', 'FORMATTED_VALUE')]
        params += [('ranges', f'{tab}!{column_name(i)}2:{column_name(i)}') for i in indexes]
        result = get(base + '/values:batchGet', params)
        ranges = result.get('valueRanges', [])
        if len(ranges) != len(indexes):
            raise BuildError('Google вернул неполный набор колонок.')
        length = max((len(r.get('values', [])) for r in ranges), default=0)
        rows = [[''] * len(header) for _ in range(length)]
        for index, part in zip(indexes, ranges):
            for n, cells in enumerate(part.get('values', [])):
                rows[n][index] = cells[0] if cells else ''
        after = get(base + '/values/' + header_range).get('values', [[]])[0]
        if after != header:
            raise BuildError('Заголовки изменились во время чтения. Повторите запуск.')
        return [header, *rows]


def normalize_size(value):
    value = text(value).replace('_', ',').replace('.', ',')
    # Единицы измерения сохраняем; числовую часть приводим к одному виду.
    match = re.fullmatch(r'(\d+(?:,\d+)?)\s*(см)?', value, re.I)
    if match:
        num = format(Decimal(match[1].replace(',', '.')).normalize(), 'f').replace('.', ',')
        return num + (' см' if match[2] else '')
    return value


def size_key(value):
    match = re.match(r'^\d+(?:[,.]\d+)?', value)
    return (0, Decimal(match[0].replace(',', '.')), value) if match else (1, Decimal(0), value)


def normalize_stock(value, aliases):
    value = aliases.get(value, value)
    if not value:
        return 'Склад не указан', False
    if re.fullmatch(r'\d{2}\.\d{2}\.\d{4}|\d{4}-\d{2}-\d{2}|\d{5}(?:[.,]\d+)?', value):
        return 'Склад не указан', True
    if 'ленин' in value.casefold():
        return 'Ленинградская 33', False
    if 'гостин' in value.casefold():
        return 'Гостинка (В.Е.Левин)', False
    return value, value not in KNOWN_STOCKS


def photo_filename(art):
    """Недопустимые символы и % кодируем байтами UTF-8; прочие сохраняем."""
    def escaped(char):
        return ''.join(f'%{b:02X}' for b in char.encode('utf-8'))
    filename = ''.join(escaped(c) if c.isspace() or c in '%/\\<>:"|?*' or ord(c) < 32 else c for c in art)
    if filename.endswith('.'):
        filename = filename[:-1] + '%2E'
    if re.match(r'^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)', filename, re.I):
        filename = escaped(filename[0]) + filename[1:]
    return filename + '.webp'


def stone_groups(row):
    """Предлагаемые правила; итоговая сборка разрешена только после согласования."""
    name = row['naim'] + ' ' + row.get('full_name', '')
    # Название бренда не должно превращать изделие в янтарное.
    if row['marka']:
        name = re.sub(re.escape(row['marka']), ' ', name, flags=re.I)
    name = re.sub(r'БР-[^\s]+', ' ', name, flags=re.I)
    value = unicodedata.normalize('NFKC', row['vstavka'] + ' ' + name).casefold()
    rules = [
        ('Бриллиантовая группа', r'бриллиант|\bбр\.\s*выр'),
        ('Фианитовая группа', r'фианит|(?<![а-яa-z])ф\s*\.?\s*\d|\d\s*ф(?![а-яa-z])'),
        ('Полудраги', r'аметист|топаз|гранат|кварц|турмалин|хризолит|агат|оникс|цитрин|раух|родолит|шпинел'),
        ('Жемчуг', r'жемчуг|перламутр'),
        ('Эмаль', r'эмаль'),
        ('Янтарь и цветнина', r'янтар|цветнин|корунд|рубин|сапфир|изумруд'),
    ]
    found = [group for group, pattern in rules if re.search(pattern, value)]
    if found:
        # Полудраги с пометкой «цветнина» остаются в основной группе.
        if 'Полудраги' in found and 'Янтарь и цветнина' in found and 'янтар' not in value:
            found.remove('Янтарь и цветнина')
        return found[0], found
    if re.search(r'без\s*(?:встав(?:ок|ки)|камн(?:ей|я))|бескамен', value):
        return 'Бескаменка', ['Бескаменка']
    return 'Не определено', []


def most_common(rows, field):
    values = [r[field] for r in rows if r.get(field)]
    if not values:
        return '', []
    count = Counter(values)
    # При равенстве частот — первое значение по порядку исходных строк.
    return count.most_common(1)[0][0], list(count)


def scan_forbidden(value):
    if isinstance(value, dict):
        for key, item in value.items():
            scan_forbidden(str(key))
            scan_forbidden(item)
    elif isinstance(value, list):
        for item in value:
            scan_forbidden(item)
    elif isinstance(value, str) and FORBIDDEN.search(html.unescape(unicodedata.normalize('NFKC', value))):
        raise BuildError('В готовом результате обнаружено запрещённое финансовое слово или поле. Выгрузка остановлена.')


def validate_catalog(data, expected_units, previous=None, max_drop=0.15):
    scan_forbidden(data)
    if set(data) != {'generated_at', 'items'} or not isinstance(data['items'], list):
        raise BuildError('Неверная структура каталога.')
    try:
        timestamp = datetime.fromisoformat(data['generated_at'].replace('Z', '+00:00'))
        if timestamp.tzinfo is None:
            raise ValueError()
    except (ValueError, TypeError, AttributeError):
        raise BuildError('Неверное время формирования каталога.') from None
    articles = set()
    total = 0
    for item in data['items']:
        if set(item) - OPTIONAL_ITEM_FIELDS not in (ITEM_FIELDS, ITEM_FIELDS - {'details'}):
            raise BuildError('В карточке есть лишние или отсутствующие поля.')
        if 'codes' in item and (not isinstance(item['codes'], list) or any(not isinstance(c, str) or not c.strip() for c in item['codes'])):
            raise BuildError('Некорректные внутренние коды изделия.')
        if not isinstance(item['art'], str) or not item['art'].strip() or item['art'] in articles:
            raise BuildError('Пустой или повторный артикул в каталоге.')
        articles.add(item['art'])
        if type(item['units']) is not int or item['units'] <= 0:
            raise BuildError('Неверное число единиц.')
        if not isinstance(item['stocks'], dict) or not item['stocks']:
            raise BuildError('Не заданы склады.')
        if any(not k or type(v) is not int or v <= 0 for k, v in item['stocks'].items()):
            raise BuildError('Некорректные остатки по складам.')
        if sum(item['stocks'].values()) != item['units']:
            raise BuildError('Сумма по складам не совпадает с числом единиц.')
        if 'stock_codes' in item:
            stock_codes=item['stock_codes']
            if not isinstance(stock_codes,dict) or set(stock_codes)!=set(item['stocks']):
                raise BuildError('Склады в кодах единиц не совпадают с остатками.')
            for stock,entries in stock_codes.items():
                if not isinstance(entries,list) or len(entries)!=item['stocks'][stock]:
                    raise BuildError('Число кодов единиц не совпадает с остатком по складу.')
                if any(not isinstance(entry,dict) or not {'code','size'} <= set(entry) or set(entry)-{'code','size','grams','prc'}
                       or not isinstance(entry['code'],str) or not isinstance(entry['size'],str)
                       or any(type(entry[field]) not in (int,float) or not math.isfinite(entry[field])
                              or entry[field] < 0 or (field=='grams' and entry[field]==0)
                              for field in ('grams','prc') if field in entry) for entry in entries):
                    raise BuildError('Неверная запись кода единицы.')
        seen_sizes = set()
        for size in item['sizes']:
            if set(size) != {'s', 'q'} or not size['s'] or type(size['q']) is not int or size['q'] <= 0 or size['s'] in seen_sizes:
                raise BuildError('Неверная запись размера.')
            seen_sizes.add(size['s'])
        if sum(s['q'] for s in item['sizes']) > item['units']:
            raise BuildError('Количество размеров превышает остаток.')
        total += item['units']
    if total != expected_units:
        raise BuildError(f'Сумма единиц {total} не совпадает с числом строк в наличии {expected_units}.')
    if previous is not None:
        old_count = len(previous['items'])
        # Decimal исключает погрешность на границе ровно 15%.
        if old_count and Decimal(len(articles)) < Decimal(old_count) * (1 - Decimal(str(max_drop))):
            raise BuildError(f'Число артикулов снизилось более чем на {max_drop:.0%}: {old_count} → {len(articles)}.')


def scan_site(directory):
    for path in Path(directory).rglob('*'):
        if path.is_file() and path.suffix.lower() in {'.json', '.html', '.css', '.js', '.mjs', '.txt', '.xml', '.svg', '.webmanifest'}:
            content = path.read_text(encoding='utf-8')
            if path.suffix.lower() == '.css':
                # margin — стандартное имя CSS-отступа, а не финансовое поле.
                # Убираем только имя свойства после начала блока/декларации;
                # строки content, комментарии и значения продолжают проверяться.
                content = re.sub(r'(?<=[{;])\s*margin(?:-[a-z]+)*\s*:', ' layout-spacing:', content)
            scan_forbidden(json.loads(content) if path.suffix.lower() == '.json' else content)


def analyze(values, config, photos=None, generated_at=None):
    if not values:
        raise BuildError('Источник пуст: нет строки заголовков.')
    columns = resolve_headers(values[0], config)
    log, blockers = [], []
    groups = defaultdict(list)
    inventory = 0
    blank_rows = 0
    no_art = 0
    ignored_templates = 0
    technical_keys = set()
    original_articles = {text(r[columns['art']]) for r in values[1:] if len(r) > columns['art'] and text(r[columns['art']])}
    codes = defaultdict(list)
    stock_counts = Counter()
    for number, cells in enumerate(values[1:], 2):
        row = {key: text(cells[i]) if i < len(cells) else '' for key, i in columns.items()}
        if not any(row.values()):
            blank_rows += 1
            continue
        if (config.get('ignore_empty_code_templates') and row['code'] == 'ЮР-000'
                and not any(v for k, v in row.items() if k != 'code')):
            ignored_templates += 1
            event(log, 'ПУСТАЯ ЗАГОТОВКА ИСКЛЮЧЕНА', number, code=row['code'])
            continue
        for field, value in list(row.items()):
            if value in ERROR_VALUES:
                event(log, 'ОШИБКА ФОРМУЛЫ', number, row['art'], field=field)
                if field in {'service', 'art', 'code'}:
                    blockers.append(f'Строка {number}: ошибка формулы в поле {config["headers"][field]}.')
                row[field] = ''
        if not row['art']:
            event(log, 'НЕТ АРТИКУЛА', number, code=row['code'], name=row['naim'], stock=row['stock'], in_stock=not row['service'])
        if row['service']:
            continue
        inventory += 1
        if not row['art']:
            no_art += 1
            if config.get('missing_article_policy') == 'unit_code':
                key = 'Без артикула · ' + row['code']
                if not row['code'] or key in original_articles or key in technical_keys:
                    blockers.append(f'Строка {number}: невозможно однозначно обозначить изделие без артикула по коду.')
                else:
                    row['art'] = key
                    technical_keys.add(key)
                    event(log, 'КАРТОЧКА БЕЗ АРТИКУЛА', number, key, code=row['code'])
        if not row['tip']:
            event(log, 'НЕТ ТИПА', number, row['art'])
        elif row['tip'].casefold() in TYPES:
            row['tip'] = TYPES[row['tip'].casefold()]
        else:
            event(log, 'НЕЗНАКОМЫЙ ТИП', number, row['art'], value=row['tip'])
        if not row['size']:
            event(log, 'НЕТ РАЗМЕРА', number, row['art'])
        row['size'] = normalize_size(row['size'])
        if row['size'] and not re.fullmatch(r'\d+(?:,\d+)?(?: см)?', row['size']):
            event(log, 'НЕОБЫЧНЫЙ РАЗМЕР', number, row['art'], value=row['size'])
        if not row['stock']:
            event(log, 'НЕТ СКЛАДА', number, row['art'])
        row['stock'], unknown = normalize_stock(row['stock'], config.get('stock_aliases', {}))
        stock_counts[row['stock']] += 1
        if unknown:
            event(log, 'НОВЫЙ СКЛАД', number, row['art'], value=row['stock'])
        if row['polnpust'] == 'Пустотелый':
            row['polnpust'] = 'Пустотел'
        if re.fullmatch(r'\d{1,2}[./-]\d{1,2}[./-]\d{2,4}', row['art']):
            event(log, 'АРТИКУЛ ПОХОЖ НА ДАТУ', number, row['art'])
        elif re.fullmatch(r'\d+(?:[.,]\d+)?(?:[eE][+-]?\d+)?', row['art']):
            event(log, 'ПРОВЕРИТЬ НАЧАЛЬНЫЕ НУЛИ', number, row['art'])
        if row['code']:
            codes[row['code']].append(number)
        else:
            event(log, 'НЕТ КОДА', number, row['art'])
        if config.get('stone_group_header') or row.get('kamni'):
            row['kamni'] = row['kamni'] or 'Не определено'
        else:
            row['kamni'], found = stone_groups(row)
            if len(found) > 1:
                event(log, 'СМЕШАННЫЕ ВСТАВКИ', number, row['art'], groups=found)
        if row['kamni'] == 'Не определено':
            event(log, 'КАМНИ НЕ ОПРЕДЕЛЕНЫ', number, row['art'])
        if row['art']:
            groups[row['art']].append(row)
    for code, numbers in codes.items():
        if len(numbers) > 1:
            event(log, 'ПОВТОР КОДА', code=code, rows=numbers)
    if no_art and config.get('missing_article_policy') != 'unit_code':
        blockers.append(f'В наличии {no_art} строк без артикула. Заполните артикулы или исправьте служебные строки в источнике.')
    if not config.get('stone_group_header') and not config.get('stone_rules_approved'):
        blockers.append('Правила группы «Камни» ещё не согласованы. Предварительная классификация доступна только в отчёте.')
    if not inventory:
        blockers.append('В источнике не найдено ни одной строки в наличии.')
    items = []
    fields = ('tip', 'char2', 'proba', 'cvet', 'polnpust', 'kamni', 'marka', 'vstavka', 'naim')
    for art, records in sorted(groups.items()):
        item = {'art': art}
        for field in fields:
            item[field], variants = most_common(records, field)
            # Разные тексты наименования и подробности вставок тоже сохраняем в отчёте.
            if len(variants) > 1:
                event(log, 'КОНФЛИКТ', art=art, field=field, values=variants, chosen=item[field])
        for field in ('char3', 'thickness'):
            chosen, variants = most_common(records, field)
            if len(variants) > 1:
                event(log, 'КОНФЛИКТ', art=art, field=field, values=variants, chosen=chosen)
        item['details'] = {field: sorted({r.get(field, '') for r in records if r.get(field, '')}, key=size_key)
                           for field in ('char2', 'char3', 'thickness', 'weight', 'vstavka', 'polnpust', 'lock')}
        item['details'] = {key: values for key, values in item['details'].items() if values}
        for field, value in config.get('article_characteristic_overrides', {}).get(art, {}).items():
            if field in ('char2', 'char3'):
                if field in item:
                    item[field] = value
                if value:
                    item['details'][field] = [value]
                else:
                    item['details'].pop(field, None)
        item['codes'] = sorted({r['code'] for r in records if r['code']})
        item['tip'] = item['tip'] or 'Не определено'
        stocks = Counter(r['stock'] for r in records)
        sizes = Counter(r['size'] for r in records if r['size'])
        stock_codes=defaultdict(list)
        for record in records:
            stock_codes[record['stock']].append(unit_entry(record))
        item.update(units=len(records), stocks=dict(sorted(stocks.items())),
                    sizes=[{'s': s, 'q': sizes[s]} for s in sorted(sizes, key=size_key)],
                    stock_codes={stock:stock_codes[stock] for stock in sorted(stocks)})
        filename = photo_filename(art)
        item['photo'] = 'photos/' + quote(filename, safe='-_.') if art not in technical_keys and photos and (Path(photos) / filename).is_file() else ''
        items.append(item)
    data = {'generated_at': generated_at or datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z'), 'items': items}
    no_photos = [item for item in items if not item['photo']]
    conflict_arts = {e['art'] for e in log if e['kind'] == 'КОНФЛИКТ'}
    characteristic_conflicts = {e['art'] for e in log if e['kind'] == 'КОНФЛИКТ' and e['field'] not in {'naim', 'vstavka'}}
    report = {
        'generated_at': data['generated_at'], 'inventory_rows': inventory,
        'articles_with_id': len(items) - len(technical_keys),
        'units_with_id': sum(i['units'] for i in items if i['art'] not in technical_keys),
        'catalog_cards': len(items), 'catalog_units': sum(i['units'] for i in items),
        'technical_cards': len(technical_keys), 'ignored_templates': ignored_templates,
        'inventory_rows_before_template_exclusion': inventory + ignored_templates,
        'inventory_rows_without_article': no_art, 'empty_rows': blank_rows,
        'conflicting_articles': len(conflict_arts), 'characteristic_conflicts': len(characteristic_conflicts),
        'stocks': dict(stock_counts), 'articles_without_photos': len(no_photos),
        'photo_status': 'Фото ещё не импортированы' if photos is None else 'Проверена локальная папка photos',
        'stone_rules_approved': bool(config.get('stone_group_header') or config.get('stone_rules_approved')),
        'provisional_stone_groups': dict(Counter(i['kamni'] for i in items)),
        'top30_without_photos': [{'art': i['art'], 'units': i['units']} for i in sorted(no_photos, key=lambda i: (-i['units'], i['art']))[:30]],
        'issue_counts': dict(Counter(e['kind'] for e in log)), 'blockers': blockers, 'issues': log,
    }
    return data, report


def atomic_write(path, content):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(dir=path.parent, suffix='.tmp')
    try:
        with os.fdopen(handle, 'w', encoding='utf-8', newline='\n') as stream:
            stream.write(content)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def save_catalog(data, report, target, previous=None, max_drop=0.15):
    if report['blockers']:
        raise BuildError(' '.join(report['blockers']))
    validate_catalog(data, report['inventory_rows'], previous, max_drop)
    atomic_write(target, json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n')


def markdown_report(report):
    def cell(value):
        return html.escape(str(value)).replace('|', '\\|').replace('\n', ' ')
    lines = ['# Отчёт сборщика «Каратник»', '', f'Срез: {report["generated_at"]}', '',
             f'- Строк с пустой услугой до исключения заготовок: **{report["inventory_rows_before_template_exclusion"]}**.',
             f'- Исключено согласованных пустых заготовок: **{report["ignored_templates"]}**.',
             f'- Товарных строк в наличии: **{report["inventory_rows"]}**.',
             f'- Уникальных непустых артикулов: **{report["articles_with_id"]}**.',
             f'- Единиц с артикулом: **{report["units_with_id"]}**.',
             f'- Строк в наличии без артикула: **{report["inventory_rows_without_article"]}**.',
             f'- Карточек «Без артикула» с кодом единицы: **{report["technical_cards"]}**.',
             f'- Всего карточек: **{report["catalog_cards"]}**, единиц: **{report["catalog_units"]}**.',
             f'- Артикулов с конфликтами характеристик: **{report["characteristic_conflicts"]}**.',
             f'- Артикулов с любыми различиями, включая наименование и вставки: **{report["conflicting_articles"]}**.',
             f'- Без локального фото: **{report["articles_without_photos"]}**. {report["photo_status"]}.', '',
             '## Причины остановки', '']
    lines += ['- ' + cell(s) for s in report['blockers']] or ['Нет.']
    lines += ['', '## Остатки по складам, включая строки без артикула', '', '| Склад | Единиц |', '|---|---:|']
    lines += [f'| {cell(k)} | {v} |' for k, v in report['stocks'].items()]
    lines += ['', '## Строки в наличии без артикула', '', 'Номер строки — номер в листе «Исходники» на момент чтения. Перед исправлением сверяйте код: строки могут перемещаться.', '',
              '| Строка | Код | Наименование | Склад в источнике |', '|---:|---|---|---|']
    for e in report['issues']:
        if e['kind'] == 'НЕТ АРТИКУЛА' and e.get('in_stock'):
            row_link = f'https://docs.google.com/spreadsheets/d/18RDx2lWEJk6wfsw01lzz6WzTq-rdElfaQj_VzHblJ14/edit#gid=1385887079&range=A{e["row"]}:AI{e["row"]}'
            lines.append(f'| [{e["row"]}]({row_link}) | {cell(e.get("code", ""))} | {cell(e.get("name", ""))} | {cell(e.get("stock", ""))} |')
    lines += ['', '## Сводка проблем', '', '| Проблема | Записей |', '|---|---:|']
    lines += [f'| {cell(k)} | {v} |' for k, v in report['issue_counts'].items()]
    lines += ['', '## Группы камней', '',
              'Правила согласованы пользователем.' if report['stone_rules_approved'] else 'Предварительная классификация: правила ещё не согласованы.',
              '', '| Группа | Карточек |', '|---|---:|']
    lines += [f'| {cell(k)} | {v} |' for k, v in report['provisional_stone_groups'].items()]
    lines += ['', '## Что фотографировать в первую очередь', '', '| Артикул | Единиц |', '|---|---:|']
    lines += [f'| {cell(i["art"])} | {i["units"]} |' for i in report['top30_without_photos']]
    return '\n'.join(lines) + '\n'


def main():
    parser = argparse.ArgumentParser(description='Сборщик каталога без финансовых данных')
    parser.add_argument('--config', default=str(ROOT / 'config.json'), help='Файл настроек')
    parser.add_argument('--snapshot', help='Локальный снимок разрешённых колонок для проверки')
    parser.add_argument('--diagnose', action='store_true', help='Только отчёт; не записывать data.json')
    parser.add_argument('--output', default='site/data.json', help='Выходной каталог')
    parser.add_argument('--report-dir', default='reports', help='Папка отчётов, отдельно от сайта')
    parser.add_argument('--photos', help='Папка импортированных фотографий')
    parser.add_argument('--previous', help='Предыдущий проверенный data.json')
    parser.add_argument('--bootstrap', action='store_true', help='Первая сборка без предыдущего каталога')
    args = parser.parse_args()
    try:
        config = json.loads(Path(args.config).read_text(encoding='utf-8'))
        snapshot = json.loads(Path(args.snapshot).read_text(encoding='utf-8')) if args.snapshot else None
        values = snapshot['values'] if snapshot else read_google(config)
        data, report = analyze(values, config, args.photos, snapshot.get('read_at') if snapshot else None)
        previous = None
        if not args.diagnose:
            if args.previous:
                previous = json.loads(Path(args.previous).read_text(encoding='utf-8'))
                if not isinstance(previous.get('items'), list) or not previous['items']:
                    raise BuildError('Предыдущий каталог пуст или повреждён.')
                validate_catalog(previous, sum(i['units'] for i in previous['items']))
            elif not args.bootstrap:
                report['blockers'].append('Не задан предыдущий каталог. Только для первой сборки используйте --bootstrap.')
        report_dir = Path(args.report_dir)
        atomic_write(report_dir / 'report.json', json.dumps(report, ensure_ascii=False, indent=2) + '\n')
        atomic_write(report_dir / 'report.md', markdown_report(report))
        # В публичный журнал попадают только числа; подробности находятся в отчёте.
        print(f'Артикулов: {report["articles_with_id"]}; строк в наличии: {report["inventory_rows"]}; без артикула: {report["inventory_rows_without_article"]}.')
        print(f'Всего карточек: {report["catalog_cards"]}; единиц: {report["catalog_units"]}; исключено пустых заготовок: {report["ignored_templates"]}.')
        print(f'Конфликтов характеристик: {report["characteristic_conflicts"]}; складов: {len(report["stocks"])}; без локальных фото: {report["articles_without_photos"]}.')
        for reason in report['blockers']:
            print('ОСТАНОВКА: ' + reason)
        if args.diagnose:
            print('Диагностика закончена. data.json не создавался.')
            return 0
        save_catalog(data, report, args.output, previous, config['max_article_drop'])
        print('УСПЕХ: data.json проверен и сохранён.')
        return 0
    except (BuildError, OSError, ValueError, KeyError, TypeError) as exc:
        # Содержимое секретов и сетевого ответа никогда не выводим.
        print('ОШИБКА: ' + (str(exc) if isinstance(exc, BuildError) else 'Не удалось прочитать входные файлы или записать результат. Проверьте настройки и пути.'))
        return 1


if __name__ == '__main__':
    sys.exit(main())

