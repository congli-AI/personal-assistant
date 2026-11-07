/* 个人助理 — 课表模块
 * 职责：课程数据、学期周次、按天展开、上课提醒、文件导入解析
 * 依赖：浏览器自带 DecompressionStream（解压 xlsx/docx）、AI_CONFIG
 */
window.ScheduleService = (function () {
  "use strict";

  var KEY = "personal-assistant.schedule.v1";

  /* 默认作息：12 节课，可在 config.js 的 SCHEDULE_CONFIG 覆盖 */
  var DEFAULT_PERIODS = [
    { s: "08:00", e: "08:45" },
    { s: "08:55", e: "09:40" },
    { s: "10:00", e: "10:45" },
    { s: "10:55", e: "11:40" },
    { s: "14:00", e: "14:45" },
    { s: "14:55", e: "15:40" },
    { s: "16:00", e: "16:45" },
    { s: "16:55", e: "17:40" },
    { s: "19:00", e: "19:45" },
    { s: "19:55", e: "20:40" },
    { s: "20:50", e: "21:35" },
    { s: "21:45", e: "22:30" },
  ];

  var state = load();

  /* ---------------- 基础 ---------------- */

  function pad2(n) {
    return n < 10 ? "0" + n : "" + n;
  }

  function keyOf(date) {
    return date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate());
  }

  function parseDate(str) {
    var parts = String(str || "").split("-");
    if (parts.length !== 3) return null;
    var d = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    return isNaN(d.getTime()) ? null : d;
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function atTime(date, hhmm) {
    var parts = String(hhmm || "0:0").split(":");
    return new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      +parts[0] || 0,
      +parts[1] || 0,
      0,
      0
    );
  }

  function mondayOf(date) {
    var offset = (date.getDay() + 6) % 7;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() - offset);
  }

  function weekdayOf(date) {
    return date.getDay() === 0 ? 7 : date.getDay();
  }

  function cfg() {
    return window.SCHEDULE_CONFIG || {};
  }

  function periods() {
    var custom = cfg().periods;
    return custom && custom.length ? custom : state.periods || DEFAULT_PERIODS;
  }

  /* ---------------- 持久化 ---------------- */

  function load() {
    var fallback = {
      termStart: keyOf(mondayOf(new Date())),
      periods: DEFAULT_PERIODS.slice(),
      courses: [],
      reminded: {},
    };
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return fallback;
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.courses)) return fallback;
      return {
        termStart: parsed.termStart || fallback.termStart,
        periods: parsed.periods && parsed.periods.length ? parsed.periods : DEFAULT_PERIODS.slice(),
        courses: parsed.courses,
        reminded: parsed.reminded || {},
      };
    } catch (err) {
      return fallback;
    }
  }

  function save() {
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify({
          termStart: state.termStart,
          periods: state.periods,
          courses: state.courses,
          reminded: state.reminded,
        })
      );
    } catch (err) {
      console.warn("课表保存失败：", err);
    }
    if (window.CloudService) window.CloudService.markDirty();
  }

  function uid() {
    return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  }

  function getState() {
    return state;
  }

  function setTermStart(dateStr) {
    if (!parseDate(dateStr)) return;
    state.termStart = dateStr;
    state.reminded = {};
    save();
  }

  function getTermStart() {
    return state.termStart;
  }

  /* ---------------- 课程 ---------------- */

  function addCourse(data) {
    var course = normalizeCourse(data);
    if (!course) return null;
    course.id = uid();
    state.courses.push(course);
    save();
    return course;
  }

  function updateCourse(id, data) {
    var index = state.courses.findIndex(function (c) {
      return c.id === id;
    });
    if (index < 0) return null;
    var course = normalizeCourse(data);
    if (!course) return null;
    course.id = id;
    state.courses[index] = course;
    save();
    return course;
  }

  function removeCourse(id) {
    state.courses = state.courses.filter(function (c) {
      return c.id !== id;
    });
    save();
  }

  function getCourses() {
    return state.courses.slice();
  }

  function expandWeeks(input) {
    if (Array.isArray(input)) {
      return input
        .map(function (v) {
          return parseInt(v, 10);
        })
        .filter(function (n) {
          return n >= 1 && n <= 40;
        });
    }
    var text = String(input || "");
    var result = [];
    text.replace(/(\d+)\s*[-~到]\s*(\d+)/g, function (_, a, b) {
      for (var i = +a; i <= +b; i++) result.push(i);
      return "";
    });
    text.replace(/\d+/g, function (n) {
      result.push(+n);
      return "";
    });
    return result.filter(function (n) {
      return n >= 1 && n <= 40;
    });
  }

  function normalizeCourse(data) {
    if (!data) return null;
    var name = String(data.name || "").trim();
    if (!name) return null;

    var weekday = parseInt(data.weekday, 10);
    if (!(weekday >= 1 && weekday <= 7)) return null;

    var start = parseInt(data.startPeriod != null ? data.startPeriod : data.start, 10);
    var end = parseInt(data.endPeriod != null ? data.endPeriod : data.end, 10);
    if (!start || !isFinite(start)) start = 1;
    if (!end || !isFinite(end)) end = start;
    if (start < 1) start = 1;
    if (end > 12) end = 12;
    if (end < start) end = start;

    var weeks = expandWeeks(data.weeks);
    if (!weeks.length) {
      for (var i = 1; i <= 16; i++) weeks.push(i);
    }
    weeks.sort(function (a, b) {
      return a - b;
    });

    return {
      name: name,
      teacher: String(data.teacher || "").trim(),
      room: String(data.room || "").trim(),
      weekday: weekday,
      startPeriod: start,
      endPeriod: end,
      weeks: weeks,
    };
  }

  /* ---------------- 展开成具体日期 ---------------- */

  function weekNumber(date) {
    var start = parseDate(state.termStart);
    if (!start) return 1;
    var diff = Math.round((startOfDay(date) - startOfDay(start)) / 86400000);
    return Math.floor(diff / 7) + 1;
  }

  function courseOccursOn(course, date) {
    if (course.weekday !== weekdayOf(date)) return false;
    var week = weekNumber(date);
    return (course.weeks || []).indexOf(week) >= 0;
  }

  function occurrencesOn(date) {
    var list = [];
    var ps = periods();

    state.courses.forEach(function (course) {
      if (!courseOccursOn(course, date)) return;
      var startPeriod = ps[course.startPeriod - 1];
      var endPeriod = ps[course.endPeriod - 1];
      if (!startPeriod || !endPeriod) return;

      list.push({
        key: course.id + "@" + keyOf(date),
        course: course,
        date: keyOf(date),
        startAt: atTime(date, startPeriod.s),
        endAt: atTime(date, endPeriod.e),
        startTime: startPeriod.s,
        endTime: endPeriod.e,
        periodLabel: course.startPeriod + "-" + course.endPeriod + "节",
      });
    });

    list.sort(function (a, b) {
      return a.startAt - b.startAt;
    });
    return list;
  }

  function daysAhead(fromDate, days) {
    var result = [];
    for (var i = 0; i < days; i++) {
      var d = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate() + i);
      result.push({
        date: keyOf(d),
        weekday: weekdayOf(d),
        items: occurrencesOn(d),
      });
    }
    return result;
  }

  /* ---------------- 提醒 ---------------- */

  function markReminded(key) {
    state.reminded[key] = Date.now();
    // 只保留最近 200 条，避免无限增长
    var keys = Object.keys(state.reminded);
    if (keys.length > 200) {
      keys
        .sort(function (a, b) {
          return state.reminded[a] - state.reminded[b];
        })
        .slice(0, keys.length - 200)
        .forEach(function (k) {
          delete state.reminded[k];
        });
    }
    save();
  }

  function dueReminder(now, leadMinutes) {
    var start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var days = daysAhead(start, 2);
    for (var i = 0; i < days.length; i++) {
      for (var j = 0; j < days[i].items.length; j++) {
        var item = days[i].items[j];
        var diff = item.startAt.getTime() - now.getTime();
        if (diff > 0 && diff <= leadMinutes * 60000 && !state.reminded[item.key]) {
          return item;
        }
      }
    }
    return null;
  }

  /* =====================================================================
   * 文件解析：xlsx / docx / csv
   * 自行解压 zip（DecompressionStream），不依赖第三方库
   * ===================================================================== */

  async function unzip(buffer) {
    var view = new DataView(buffer);
    var len = view.byteLength;
    var eocd = -1;

    for (var i = len - 22; i >= Math.max(0, len - 66000); i--) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error("不是有效的 xlsx/docx 文件");

    var count = view.getUint16(eocd + 10, true);
    var cdOffset = view.getUint32(eocd + 16, true);
    var entries = {};
    var p = cdOffset;

    for (var n = 0; n < count; n++) {
      if (view.getUint32(p, true) !== 0x02014b50) break;
      var method = view.getUint16(p + 10, true);
      var compSize = view.getUint32(p + 20, true);
      var nameLen = view.getUint16(p + 28, true);
      var extraLen = view.getUint16(p + 30, true);
      var commentLen = view.getUint16(p + 32, true);
      var localOffset = view.getUint32(p + 42, true);
      var name = new TextDecoder().decode(new Uint8Array(buffer, p + 46, nameLen));

      var lNameLen = view.getUint16(localOffset + 26, true);
      var lExtraLen = view.getUint16(localOffset + 28, true);
      var dataStart = localOffset + 30 + lNameLen + lExtraLen;

      entries[name] = {
        method: method,
        data: new Uint8Array(buffer, dataStart, compSize),
      };
      p += 46 + nameLen + extraLen + commentLen;
    }
    return entries;
  }

  async function entryText(entry) {
    if (!entry) return "";
    if (entry.method === 0) return new TextDecoder().decode(entry.data);
    if (typeof DecompressionStream === "undefined") {
      throw new Error("当前浏览器不支持解压，请用新版 Chrome / Edge / Safari");
    }
    var stream = new Blob([entry.data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    var buf = await new Response(stream).arrayBuffer();
    return new TextDecoder().decode(buf);
  }

  function colIndex(ref) {
    var letters = String(ref || "").replace(/[^A-Z]/g, "");
    var index = 0;
    for (var i = 0; i < letters.length; i++) {
      index = index * 26 + (letters.charCodeAt(i) - 64);
    }
    return index - 1;
  }

  async function xlsxToText(buffer) {
    var entries = await unzip(buffer);
    var sheetName = entries["xl/worksheets/sheet1.xml"]
      ? "xl/worksheets/sheet1.xml"
      : Object.keys(entries).find(function (k) {
          return /^xl\/worksheets\/sheet\d+\.xml$/.test(k);
        });
    if (!sheetName) throw new Error("没找到工作表");

    var shared = [];
    if (entries["xl/sharedStrings.xml"]) {
      var sharedXml = await entryText(entries["xl/sharedStrings.xml"]);
      var sharedDoc = new DOMParser().parseFromString(sharedXml, "application/xml");
      var sis = sharedDoc.getElementsByTagName("si");
      for (var i = 0; i < sis.length; i++) {
        var ts = sis[i].getElementsByTagName("t");
        var text = "";
        for (var t = 0; t < ts.length; t++) text += ts[t].textContent;
        shared.push(text);
      }
    }

    var xml = await entryText(entries[sheetName]);
    var doc = new DOMParser().parseFromString(xml, "application/xml");
    var rows = doc.getElementsByTagName("row");
    var lines = [];

    for (var r = 0; r < rows.length; r++) {
      var cells = rows[r].getElementsByTagName("c");
      var values = [];
      for (var c = 0; c < cells.length; c++) {
        var cell = cells[c];
        var type = cell.getAttribute("t");
        var v = cell.getElementsByTagName("v")[0];
        var value = "";

        if (type === "s" && v) {
          value = shared[parseInt(v.textContent, 10)] || "";
        } else if (type === "inlineStr") {
          var inline = cell.getElementsByTagName("t")[0];
          value = inline ? inline.textContent : "";
        } else if (v) {
          value = v.textContent;
        }

        var index = colIndex(cell.getAttribute("r"));
        if (index < 0) index = values.length;
        while (values.length < index) values.push("");
        values[index] = value;
      }
      lines.push(values.join("\t"));
    }

    return lines.join("\n").trim();
  }

  async function docxToText(buffer) {
    var entries = await unzip(buffer);
    var xml = await entryText(entries["word/document.xml"]);
    if (!xml) throw new Error("没找到 Word 正文");

    var W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    var doc = new DOMParser().parseFromString(xml, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) {
      throw new Error("Word 文件结构异常，无法解析");
    }

    var body = doc.getElementsByTagNameNS(W, "body")[0];
    if (!body) throw new Error("没找到 Word 正文");

    function textOf(node) {
      var ts = node.getElementsByTagNameNS(W, "t");
      var text = "";
      for (var i = 0; i < ts.length; i++) text += ts[i].textContent;
      return text.trim();
    }

    function tableLines(table) {
      var lines = [];
      var rows = table.getElementsByTagNameNS(W, "tr");
      for (var r = 0; r < rows.length; r++) {
        var cells = rows[r].getElementsByTagNameNS(W, "tc");
        var values = [];
        for (var c = 0; c < cells.length; c++) values.push(textOf(cells[c]));
        if (values.join("").trim()) lines.push(values.join("\t"));
      }
      return lines;
    }

    var lines = [];
    var children = body.childNodes;
    for (var i = 0; i < children.length; i++) {
      var node = children[i];
      if (node.nodeType !== 1) continue;
      if (node.localName === "tbl") {
        lines = lines.concat(tableLines(node));
        lines.push("");
      } else if (node.localName === "p") {
        var text = textOf(node);
        if (text) lines.push(text);
      }
    }

    // 有些文档把表格包在别的节点里，兜底再扫一遍
    if (!lines.length) {
      var tables = doc.getElementsByTagNameNS(W, "tbl");
      for (var t = 0; t < tables.length; t++) {
        lines = lines.concat(tableLines(tables[t]));
      }
    }

    return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  async function fileToText(file) {
    var name = String(file.name || "").toLowerCase();
    if (name.endsWith(".xlsx")) return xlsxToText(await file.arrayBuffer());
    if (name.endsWith(".docx")) return docxToText(await file.arrayBuffer());
    if (name.endsWith(".csv") || name.endsWith(".txt")) return file.text();

    if (name.endsWith(".doc") || name.endsWith(".xls")) {
      throw new Error("不支持旧格式 .doc/.xls，请另存为 .docx/.xlsx 再导入");
    }
    throw new Error("只支持 .xlsx / .csv / .docx");
  }

  /* ---------------- AI 结构化 ---------------- */

  function extractJson(text) {
    var raw = String(text || "").trim();
    raw = raw.replace(/^```(json)?/i, "").replace(/```$/, "").trim();
    var start = raw.indexOf("{");
    var end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("AI 没有返回 JSON");
    return JSON.parse(raw.slice(start, end + 1));
  }

  async function structureText(text) {
    var chat =
      window.PersonalAssistant && window.PersonalAssistant.chatComplete
        ? window.PersonalAssistant.chatComplete
        : null;
    if (!chat) throw new Error("AI 接口不可用");

    var system =
      "你是课表解析器。输入是从 Excel/Word 导出的一段课表文本（制表符分列、换行分行），可能包含表头、合并单元格留下的空列。\n" +
      '只输出 JSON，不要解释：{"courses":[{"name":"课程名","teacher":"老师","room":"教室","weekday":1,"start":1,"end":2,"weeks":[1,2,3]}]}\n' +
      "规则：weekday 用 1-7 表示周一到周日；start/end 是节次编号（数字）；weeks 是上课周次数组，范围写法的要展开；" +
      "单周/双周只保留对应周次；不确定的字段用空字符串；看不清的行直接跳过。";

    var message = await chat([
      { role: "system", content: system },
      { role: "user", content: String(text || "").slice(0, 14000) },
    ]);

    var data = extractJson(message.content);
    var rawCourses = Array.isArray(data.courses) ? data.courses : [];
    var courses = [];

    rawCourses.forEach(function (item) {
      var normalized = normalizeCourse({
        name: item.name,
        teacher: item.teacher,
        room: item.room,
        weekday: item.weekday,
        startPeriod: item.start,
        endPeriod: item.end,
        weeks: item.weeks,
      });
      if (normalized) courses.push(normalized);
    });

    if (!courses.length) throw new Error("没有识别出课程，请检查文件内容");
    return courses;
  }

  async function importCourses(list) {
    var added = [];
    list.forEach(function (course) {
      var created = addCourse(course);
      if (created) added.push(created);
    });
    save();
    return added;
  }

  return {
    getState: getState,
    save: save,
    getCourses: getCourses,
    addCourse: addCourse,
    updateCourse: updateCourse,
    removeCourse: removeCourse,
    setTermStart: setTermStart,
    getTermStart: getTermStart,
    weekNumber: weekNumber,
    daysAhead: daysAhead,
    occurrencesOn: occurrencesOn,
    dueReminder: dueReminder,
    markReminded: markReminded,
    periods: periods,
    fileToText: fileToText,
    structureText: structureText,
    importCourses: importCourses,
    expandWeeks: expandWeeks,
  };
})();
