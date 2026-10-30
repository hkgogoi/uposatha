/* Uposatha's standalone reader uses the app's existing React runtime. */
export const STORAGE_KEY = 'uposatha-readings-v1';
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
// Keep this allowlist aligned with the bundled catalogue, never browser storage.
const CHAPTERS = Object.freeze({dhammapada:26, 'heart-sutra':1, metta:1,
  blessings:1, 'first-teaching':1, 'eight-precepts':1});
const isRecord = value => !!value && typeof value === 'object' &&
  !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));

export function normalizeState(raw) {
  const state = isRecord(raw) ? raw : {};
  const places = {};
  const saved = isRecord(state.places) ? state.places : {};
  for (const [id, chapters] of Object.entries(CHAPTERS)) {
    if (!Object.hasOwn(saved, id)) continue;
    const place = saved[id];
    if (!isRecord(place) || !Number.isSafeInteger(place.chapter)) continue;
    places[id] = {chapter: clamp(place.chapter, 0, chapters - 1), ratio: Number.isFinite(place.ratio) ? clamp(place.ratio, 0, 1) : 0};
  }
  return {
    size: Number.isFinite(state.size) ? clamp(state.size, 16, 30) : 20,
    theme: state.theme === 'night' ? 'night' : 'paper', places
  };
}

// An absent/malformed whole record means "leave the destination reader alone".
// A valid object is sanitized field by field, including explicit empty defaults.
export function normalizeBackupReading(value) {
  if (typeof value !== 'string' || value.length > 65536) return null;
  try {
    const raw = JSON.parse(value);
    return isRecord(raw) ? JSON.stringify(normalizeState(raw)) : null;
  } catch { return null; }
}

export function readState(storage) {
  try { return normalizeState(JSON.parse(storage.getItem(STORAGE_KEY))); }
  catch { return normalizeState(null); }
}
export function writeState(storage, state) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(normalizeState(state))); return true; }
  catch { return false; }
}

export function ReadingLibrary({react: React}) {
  const h = React.createElement;
  const memory = React.useRef(null);
  if (!memory.current) {
    try { memory.current = readState(window.localStorage); }
    catch { memory.current = normalizeState(null); }
  }
  const [books, setBooks] = React.useState(null);
  const [loadError, setLoadError] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);
  const [bookId, setBookId] = React.useState(null);
  const [chapter, setChapter] = React.useState(0);
  const [size, setSize] = React.useState(memory.current.size);
  const [theme, setTheme] = React.useState(memory.current.theme);
  const [notice, setNotice] = React.useState('');
  const [, redrawPlaces] = React.useState(0);
  const dialog = React.useRef(null);
  const pages = React.useRef(null);
  const opener = React.useRef(null);
  const book = books?.find(item => item.id === bookId);
  const section = book?.sections[chapter];

  const persist = () => {
    let ok = false;
    try { ok = writeState(window.localStorage, memory.current); } catch {}
    if (!ok) setNotice('Your browser could not save reading preferences. Your place will be kept for this session.');
  };
  React.useEffect(() => {
    const controller = new AbortController();
    setLoadError(false);
    fetch(new URL('./readings-v17.json', import.meta.url), {signal: controller.signal})
      .then(response => { if (!response.ok) throw Error('Reading collection unavailable'); return response.json(); })
      .then(data => { if (!Array.isArray(data.books) || data.books.length !== 6) throw Error('Invalid reading collection'); setBooks(data.books); })
      .catch(error => { if (error.name !== 'AbortError') setLoadError(true); });
    return () => controller.abort();
  }, [attempt]);

  React.useLayoutEffect(() => {
    if (!book || !dialog.current) return;
    if (!dialog.current.open) dialog.current.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      opener.current?.focus();
    };
  }, [bookId]);

  React.useLayoutEffect(() => {
    if (!book || !pages.current) return;
    const place = memory.current.places[book.id];
    const ratio = place?.chapter === chapter ? place.ratio : 0;
    pages.current.scrollTop = ratio * Math.max(0, pages.current.scrollHeight - pages.current.clientHeight);
  }, [bookId, chapter, size]);

  const savePlace = () => {
    if (!book || !pages.current) return;
    const range = pages.current.scrollHeight - pages.current.clientHeight;
    memory.current.places[book.id] = {chapter, ratio: range > 0 ? clamp(pages.current.scrollTop / range, 0, 1) : 0};
    persist();
  };
  const close = () => { savePlace(); setBookId(null); redrawPlaces(n => n + 1); };
  const open = (item, event) => {
    opener.current = event.currentTarget;
    setChapter(clamp(memory.current.places[item.id]?.chapter || 0, 0, item.sections.length - 1));
    setBookId(item.id);
  };
  const changeChapter = next => {
    const index = clamp(Number(next), 0, book.sections.length - 1);
    if (index === chapter) return;
    memory.current.places[book.id] = {chapter: index, ratio: 0};
    persist();
    setChapter(index);
  };
  const changeSize = next => {
    savePlace();
    const value = clamp(next, 16, 30);
    memory.current.size = value;
    persist(); setSize(value);
  };
  const changeTheme = () => {
    const value = theme === 'paper' ? 'night' : 'paper';
    memory.current.theme = value;
    persist(); setTheme(value);
  };

  return h('section', {id: 'readings', className: 'reading-library', 'aria-labelledby': 'reading-library-title'},
    h('div', {className: 'section-heading'}, h('div', null,
      h('span', {className: 'eyebrow'}, 'A LITTLE WISDOM, AT YOUR OWN PACE'),
      h('h2', {id: 'reading-library-title'}, 'A quiet place to read'),
      h('p', {className: 'reading-intro'}, 'Six Buddhist texts, from a few peaceful minutes to a chapter each day.'))),
    h('p', {className: 'reading-offline'}, 'English · Adjustable text · Your place saved on this device · Available offline after the app finishes downloading'),
    !books && !loadError && h('p', {role: 'status'}, 'Opening the reading collection…'),
    loadError && h('div', {role: 'status'}, h('p', null, 'The reading collection could not be loaded. Connect once to download it.'),
      h('button', {type: 'button', className: 'outline', onClick: () => setAttempt(n => n + 1)}, 'Try again')),
    books && h('div', {className: 'reading-grid'}, ...books.map((item, index) => {
      const place = memory.current.places[item.id];
      return h('article', {className: 'reading-card', key: item.id},
        h('div', {className: 'reading-card-top'}, h('span', {className: 'reading-number', 'aria-hidden': true}, String(index + 1).padStart(2, '0')),
          h('span', {className: 'reading-tradition'}, item.tradition)),
        h('h3', null, item.title), h('p', {className: 'reading-subtitle'}, item.subtitle),
        h('p', {className: 'reading-description'}, item.description),
        h('small', {className: 'reading-length'}, item.kind),
        h('button', {type: 'button', className: 'reading-open', onClick: event => open(item, event),
          'aria-label': (place ? 'Continue reading ' : 'Read ') + item.title}, place ? 'Continue reading' : 'Read this text', h('span', {'aria-hidden': true}, ' ↗')));
    })),
    notice && h('p', {role: 'status', className: 'reading-notice'}, notice),
    book && section && h('dialog', {ref: dialog, className: 'reading-dialog', 'data-theme': theme,
      'aria-labelledby': 'reader-title', onCancel: event => { event.preventDefault(); close(); }},
      h('header', {className: 'reader-header'}, h('div', null,
        h('span', {className: 'eyebrow'}, 'UPOSATHA · READING'),
        h('h2', {id: 'reader-title'}, book.title)),
        h('button', {type: 'button', className: 'reader-close', onClick: close, 'aria-label': 'Close reading and save my place'}, 'Close', h('span', {'aria-hidden': true}, ' ×'))),
      h('div', {className: 'reader-tools', role: 'group', 'aria-label': 'Reading controls'},
        h('div', {className: 'reader-font'},
          h('button', {type: 'button', disabled: size <= 16, onClick: () => changeSize(size - 2), 'aria-label': 'Decrease reading text size'}, 'A−'),
          h('output', {'aria-live': 'polite', 'aria-label': 'Reading text size'}, size + ' px'),
          h('button', {type: 'button', disabled: size >= 30, onClick: () => changeSize(size + 2), 'aria-label': 'Increase reading text size'}, 'A+')),
        h('button', {type: 'button', className: 'reader-theme', onClick: changeTheme, 'aria-pressed': theme === 'night'}, theme === 'night' ? 'Paper reading' : 'Night reading')),
      book.sections.length > 1 && h('label', {className: 'reader-chapter'}, 'Chapter',
        h('select', {value: chapter, onChange: event => changeChapter(event.target.value), 'aria-label': 'Choose Dhammapada chapter'},
          ...book.sections.map((part, i) => h('option', {value: i, key: part.title}, part.title + ' · ' + part.reference)))),
      h('div', {className: 'reader-pages', ref: pages, tabIndex: 0, onScroll: savePlace,
        'aria-label': book.title + ' text', style: {fontSize: size + 'px'}},
        h('article', {className: 'reader-prose'},
          h('p', {className: 'reader-reference'}, book.reference),
          h('h3', {tabIndex: -1}, section.title),
          h('p', {className: 'reader-credit'}, book.translator),
          ...section.paragraphs.map(paragraph => h('p', {key: paragraph.ref, className: 'reader-paragraph', id: 'reading-' + paragraph.ref.replace(/[^a-z0-9]/gi, '-')},
            paragraph.label && h('span', {className: 'reader-verse', 'aria-label': 'Verse ' + paragraph.label}, paragraph.label), paragraph.text)),
          book.sections.length > 1 && h('nav', {className: 'reader-turn', 'aria-label': 'Reading chapters'},
            h('button', {type: 'button', disabled: chapter === 0, onClick: () => changeChapter(chapter - 1)}, '← Previous'),
            h('span', null, (chapter + 1) + ' of ' + book.sections.length),
            h('button', {type: 'button', disabled: chapter === book.sections.length - 1, onClick: () => changeChapter(chapter + 1)}, 'Next →')),
          h('details', {className: 'reader-source'}, h('summary', null, 'About this text & source'),
            h('p', null, book.note), h('p', null, book.license),
            h('a', {href: section.sourceUrl || book.sourceUrl, target: '_blank', rel: 'noopener noreferrer'}, 'Read the source edition ↗'),
            book.licenseUrl && h('a', {href: book.licenseUrl, target: '_blank', rel: 'noopener noreferrer'}, 'Reuse terms ↗')))),
      h('div', {className: 'reader-status', role: 'status'}, notice || 'Your reading place is saved automatically on this device.')));
}
