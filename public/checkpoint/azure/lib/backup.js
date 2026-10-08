/* Checkpoint — weekly backup for the scheduled monitor.
 * Copies of the zip writer, toCsv and the backup builder in
 * public/checkpoint/lib.js (the Function and the browser share no
 * module); test/backup-changes-ack.test.mjs fails if they differ.
 * Change one, change the other.
 */
  var CRC_TABLE = (function () {
    var t = [];
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    var c = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function u16(v) { return [v & 0xFF, (v >>> 8) & 0xFF]; }
  function u32(v) { return [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]; }
  function dosDateTime(d) {
    return {
      time: ((d.getHours() & 0x1F) << 11) | ((d.getMinutes() & 0x3F) << 5) | (Math.floor(d.getSeconds() / 2) & 0x1F),
      date: (((Math.max(0, d.getFullYear() - 1980)) & 0x7F) << 9) | (((d.getMonth() + 1) & 0xF) << 5) | (d.getDate() & 0x1F)
    };
  }
  function buildZip(files, date) {
    var dt = dosDateTime(date || new Date());
    var enc = new TextEncoder();
    var localEntries = [], centralEntries = [], offset = 0;
    files.forEach(function (f) {
      var nameBytes = Array.from(enc.encode(f.name));
      var dataBytes = f.bytes ? Array.from(f.bytes) : Array.from(enc.encode(f.content));
      var crc = crc32(dataBytes);
      var local = [].concat(
        u32(0x04034b50), u16(20), u16(0), u16(0), u16(dt.time), u16(dt.date),
        u32(crc), u32(dataBytes.length), u32(dataBytes.length),
        u16(nameBytes.length), u16(0), nameBytes, dataBytes
      );
      localEntries.push(local);
      centralEntries.push([].concat(
        u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(dt.time), u16(dt.date),
        u32(crc), u32(dataBytes.length), u32(dataBytes.length),
        u16(nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nameBytes
      ));
      offset += local.length;
    });
    var centralBytes = [].concat.apply([], centralEntries);
    var eocd = [].concat(
      u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
      u32(centralBytes.length), u32(offset), u16(0)
    );
    return Uint8Array.from([].concat.apply([], localEntries).concat(centralBytes, eocd));
  }
  function toCsv(rows) {
    function cell(v) {
      var s = v == null ? '' : String(v);
      return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }
    return rows.map(function (row) { return row.map(cell).join(','); }).join('\r\n');
  }
  var BACKUP_ROOT = 'Checkpoint backups';
  var BACKUP_SECRET_RE = /secret|token|password|api.?key|webhook|credential/i;
  function backupStrip(v) {
    if (Array.isArray(v)) return v.map(backupStrip);
    if (v && typeof v === 'object') {
      var o = {};
      Object.keys(v).forEach(function (k) { if (k.charAt(0) !== '_' && k.charAt(0) !== '@') o[k] = backupStrip(v[k]); });
      return o;
    }
    return v;
  }
  function backupSafeSettings(settings) {
    var out = {}, s = settings || {};
    Object.keys(s).forEach(function (k) { if (!BACKUP_SECRET_RE.test(k)) out[k] = s[k]; });
    return out;
  }
  function backupFileName(today, kind) {
    return 'checkpoint-backup-' + String(today).slice(0, 10) + (kind === 'manual' ? '-manual' : '') + '.zip';
  }
  function buildBackupFiles(d) {
    d = d || {};
    var regs = d.registers || {}, counts = {};
    Object.keys(regs).forEach(function (k) { counts[k] = (regs[k] || []).length; });
    var json = {
      format: 'checkpoint-backup', formatVersion: 1, created: d.created || '', source: d.source || 'manual',
      appVersion: d.appVersion || '', client: d.client || '', counts: counts,
      registers: backupStrip(regs), settings: backupSafeSettings(d.settings)
    };
    var ev = (d.evidence || []).filter(function (e) { return e && e.ref; });
    var withUrl = ev.filter(function (e) { return e.url; }).length;
    var readme = [
      'Checkpoint backup — ' + (d.client || 'your organisation'),
      'Created ' + (d.created || '') + (d.source === 'scheduled' ? ' by the weekly scheduled backup' : ' by "Back up now"') + (d.appVersion ? ', Checkpoint ' + d.appVersion : '') + '.',
      '',
      'What is in it:',
      '  checkpoint-backup.json  every register record and the settings, in full (secrets such as webhook URLs and API keys are left out).',
      '  evidence-index.csv      each control and clause with its evidence link (' + withUrl + ' of ' + ev.length + ' have one). The files themselves stay in SharePoint.',
      (d.csvs || []).length ? '  *.csv                   each register as a spreadsheet, the same as Export all.' : '',
      '',
      'Restoring:',
      '  Risks, actions, vendors and assets can be re-imported with Import CSV on each register.',
      '  For a full restore of every register from checkpoint-backup.json, contact Compliance365 support.',
      '',
      'Record counts: ' + Object.keys(counts).map(function (k) { return k + ' ' + counts[k]; }).join(', ')
    ].filter(function (l, i, a) { return l !== '' || a[i - 1] !== ''; }).join('\r\n');
    var files = [
      { name: 'README.txt', content: readme },
      { name: 'checkpoint-backup.json', content: JSON.stringify(json, null, 1) },
      { name: 'evidence-index.csv', content: toCsv([['Framework', 'Control or clause', 'Title', 'Status', 'Evidence link', 'Last verified']].concat(ev.map(function (e) { return [e.framework || '', e.ref, e.title || '', e.status || '', e.url || '', e.verified || '']; }))) }
    ];
    return files.concat(d.csvs || []);
  }
  function backupsToPrune(names, keep) {
    var k = keep == null ? 13 : Number(keep);
    if (!(k > 0)) return [];
    var dated = (names || []).filter(function (n) { return /^checkpoint-backup-\d{4}-\d{2}-\d{2}(-manual)?\.zip$/.test(n); })
      .sort(function (a, b) { return b.localeCompare(a); });
    return dated.slice(k);
  }
  function backupDue(settings, today) {
    var s = settings || {};
    if (s.backupEnabled === 'false') return false;
    var last = String(s.backupLastRun || '').slice(0, 10);
    if (!last) return true;
    return (Date.parse(String(today).slice(0, 10)) - Date.parse(last)) / 86400000 >= 7;
  }

module.exports = { buildZip: buildZip, toCsv: toCsv, BACKUP_ROOT: BACKUP_ROOT, backupStrip: backupStrip, backupSafeSettings: backupSafeSettings, backupFileName: backupFileName, buildBackupFiles: buildBackupFiles, backupsToPrune: backupsToPrune, backupDue: backupDue };
