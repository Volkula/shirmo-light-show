(function () {
  let ctx = null;
  let token = 0;
  let timer = 0;
  let playingId = "";
  let stepIndex = 0;
  let live = { color: [255, 176, 96], bright: 80 };
  let statusText = "";
  let saveTimer = 0;
  let watch = 0;

  function campaign() {
    try { return ctx && ctx.campaign ? ctx.campaign() : null; }
    catch (err) { return null; }
  }

  function bag() {
    const data = campaign();
    if (!data) return { presets: [], selected: "" };
    if (!data.lightShow || typeof data.lightShow !== "object" || Array.isArray(data.lightShow)) {
      data.lightShow = { presets: [], selected: "" };
    }
    if (!Array.isArray(data.lightShow.presets)) data.lightShow.presets = [];
    return data.lightShow;
  }

  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try { if (ctx && ctx.save) ctx.save(); } catch (err) {}
    }, 300);
  }

  function devices() {
    try { return window.ShirmoPlugins && window.ShirmoPlugins.rgb ? window.ShirmoPlugins.rgb() : []; }
    catch (err) { return []; }
  }

  function readyDevices() {
    return devices().filter(function (device) {
      try { return !device.ready || device.ready(); }
      catch (err) { return false; }
    });
  }

  function catalog() {
    const rows = [];
    devices().forEach(function (device) {
      let targets = [];
      try { targets = device.targets ? device.targets() : []; } catch (err) { targets = []; }
      if (!targets.length) {
        rows.push({ key: device.label || "Свет", device: device, lampId: null, label: device.label || "Свет" });
        return;
      }
      targets.forEach(function (target) {
        rows.push({
          key: (device.label || "Свет") + ":" + target.id,
          device: device,
          lampId: target.id,
          label: target.label || target.id
        });
      });
    });
    return rows;
  }

  function chosenKeys() {
    const data = bag();
    return Array.isArray(data.lampKeys) ? data.lampKeys : null;
  }

  function selectedRows() {
    const rows = catalog();
    const keys = chosenKeys();
    if (!keys) return rows;
    return rows.filter(function (row) { return keys.indexOf(row.key) >= 0; });
  }

  function lampWord(count) {
    const mod10 = count % 10;
    const mod100 = count % 100;
    if (mod10 === 1 && mod100 !== 11) return count + " лампа";
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return count + " лампы";
    return count + " ламп";
  }

  function lampSummary() {
    const rows = catalog();
    if (!rows.length) return "Нет ламп";
    const keys = chosenKeys();
    const pickedCount = !keys ? rows.length : rows.filter(function (row) { return keys.indexOf(row.key) >= 0; }).length;
    if (!pickedCount) return "Лампы не выбраны";
    if (pickedCount >= rows.length) return "Все лампы";
    return lampWord(pickedCount);
  }

  function groupsOf(rows) {
    const groups = [];
    rows.forEach(function (row) {
      let group = null;
      groups.forEach(function (item) { if (item.device === row.device) group = item; });
      if (!group) {
        group = { device: row.device, ids: [], whole: false };
        groups.push(group);
      }
      if (row.lampId == null) group.whole = true;
      else group.ids.push(row.lampId);
    });
    return groups;
  }

  function holdAll() {
    groupsOf(selectedRows()).forEach(function (group) {
      try { if (group.device.hold) group.device.hold(group.whole ? null : group.ids); } catch (err) {}
    });
  }

  function paintDevices(color, bright, force) {
    live = { color: color.slice(), bright: bright };
    groupsOf(selectedRows()).forEach(function (group) {
      try { group.device.frame(color, bright, force === true, group.whole ? null : group.ids); } catch (err) {}
    });
  }

  function closeLampPop() {
    document.querySelectorAll(".light-pop").forEach(function (node) {
      if (node._away) document.removeEventListener("pointerdown", node._away, true);
      node.remove();
    });
  }

  function openLampPop(anchor) {
    closeLampPop();
    const rows = catalog();
    const pop = el("div", "light-pop");
    pop.append(el("h3", "", "На каких лампах"));
    if (!rows.length) pop.append(el("p", "note", "Нет ламп на связи."));
    const keys = chosenKeys();
    rows.forEach(function (row) {
      const label = el("label", "light-check");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = !keys || keys.indexOf(row.key) >= 0;
      box.addEventListener("change", function () {
        const data = bag();
        const next = catalog().filter(function (item) {
          if (item.key === row.key) return box.checked;
          const current = Array.isArray(data.lampKeys) ? data.lampKeys : null;
          return !current || current.indexOf(item.key) >= 0;
        }).map(function (item) { return item.key; });
        data.lampKeys = next;
        persist();
        document.querySelectorAll("[data-light-lamps]").forEach(function (node) { node.textContent = lampSummary(); });
      });
      label.append(box, document.createTextNode(row.label));
      pop.append(label);
    });
    const acts = el("div", "light-line");
    const all = el("button", "", "Все");
    all.type = "button";
    all.addEventListener("click", function () {
      bag().lampKeys = null;
      persist();
      openLampPop(anchor);
    });
    const done = el("button", "", "Готово");
    done.type = "button";
    done.addEventListener("click", closeLampPop);
    acts.append(all, done);
    pop.append(acts);
    document.body.append(pop);
    const rect = anchor.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - 280)) + "px";
    pop.style.top = Math.min(rect.bottom + 6, window.innerHeight - 16) + "px";
    setTimeout(function () {
      function away(event) {
        if (pop.contains(event.target) || anchor.contains(event.target)) return;
        closeLampPop();
      }
      pop._away = away;
      document.addEventListener("pointerdown", away, true);
    }, 0);
  }

  function setStatus(text) {
    statusText = text || "";
    document.querySelectorAll("[data-light-status]").forEach(function (node) { node.textContent = statusText; });
  }

  function deviceLine() {
    const list = devices();
    if (!list.length) return "Включённых плагинов света нет.";
    return list.map(function (device) {
      let on = false;
      try { on = !device.ready || device.ready(); } catch (err) { on = false; }
      return (device.label || "Свет") + (on ? " на связи" : " без связи");
    }).join(" · ");
  }

  function stopRun() {
    token += 1;
    clearTimeout(timer);
    timer = 0;
    playingId = "";
    document.querySelectorAll("[data-light-play]").forEach(function (node) { node.classList.remove("is-on"); });
  }

  function easeBright(t, kind) {
    if (kind === "sharp") return 1 - Math.pow(1 - t, 3);
    return t;
  }

  function mix(from, to, t) {
    return [0, 1, 2].map(function (index) { return from[index] + (to[index] - from[index]) * t; });
  }

  function parseHex(hex) {
    const match = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
    if (!match) return [255, 255, 255];
    const num = parseInt(match[1], 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
  }

  function hexOf(rgb) {
    return "#" + rgb.map(function (part) {
      return ("0" + Math.max(0, Math.min(255, Math.round(part))).toString(16)).slice(-2);
    }).join("");
  }

  function runFade(toColor, toBright, seconds, easeName, done) {
    const mine = token;
    const fromColor = live.color.slice();
    const fromBright = live.bright;
    const steps = Math.max(2, Math.round(Math.max(0.2, seconds) / 0.1));
    let index = 0;
    holdAll();
    function tick() {
      if (mine !== token) return;
      index += 1;
      const t = Math.min(1, index / steps);
      const color = mix(fromColor, toColor, t);
      const bright = fromBright + (toBright - fromBright) * easeBright(t, easeName);
      paintDevices(color, bright, t === 1);
      if (t < 1) timer = setTimeout(tick, 100);
      else if (done) done();
    }
    tick();
  }

  function playPreset(preset) {
    const steps = preset && preset.steps || [];
    if (!steps.length) { setStatus("В пресете нет шагов"); return; }
    if (!selectedRows().length) { setStatus("Лампы не выбраны"); return; }
    stopRun();
    const mine = token;
    playingId = preset.id;
    stepIndex = 0;
    document.querySelectorAll('[data-light-play="' + cssAttr(preset.id) + '"]').forEach(function (node) {
      node.classList.add("is-on");
    });
    function next() {
      if (mine !== token) return;
      const step = steps[stepIndex];
      setStatus(preset.name + " · шаг " + (stepIndex + 1));
      runFade(parseHex(step.color), Number(step.bright) || 0, Number(step.seconds) || 1, step.ease, function () {
        if (mine !== token) return;
        stepIndex += 1;
        if (stepIndex >= steps.length) {
          if (preset.loop === false) {
            playingId = "";
            setStatus("Готово");
            document.querySelectorAll("[data-light-play]").forEach(function (node) { node.classList.remove("is-on"); });
            return;
          }
          stepIndex = 0;
        }
        next();
      });
    }
    next();
  }

  function cssAttr(value) {
    if (window.CSS && CSS.escape) return CSS.escape(String(value));
    return String(value).replace(/"/g, "");
  }

  function cleanStep(step) {
    if (!step || typeof step !== "object") return null;
    const color = /^#[0-9a-f]{6}$/i.test(step.color || "") ? String(step.color).toLowerCase() : "";
    if (!color) return null;
    return {
      color: color,
      seconds: Math.max(0.2, Math.min(120, Number(step.seconds) || 1)),
      bright: Math.max(0, Math.min(100, Math.round(Number(step.bright) || 0))),
      ease: step.ease === "sharp" ? "sharp" : "smooth"
    };
  }

  function cleanPreset(row) {
    if (!row || typeof row !== "object") return null;
    const steps = (Array.isArray(row.steps) ? row.steps : []).map(cleanStep).filter(Boolean).slice(0, 40);
    if (!steps.length) return null;
    const id = typeof row.id === "string" && /^[\w-]{1,80}$/.test(row.id) ? row.id : crypto.randomUUID();
    return {
      id: id,
      name: String(row.name || "Пресет").slice(0, 80),
      loop: row.loop !== false,
      steps: steps
    };
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function selectedPreset() {
    const data = bag();
    return data.presets.find(function (row) { return row.id === data.selected; }) || data.presets[0] || null;
  }

  function draw(root) {
    root.replaceChildren();
    const data = bag();
    const head = el("div", "light-head");
    head.append(el("h2", "", "Свет"));
    const devicesNode = el("p", "note", deviceLine());
    devicesNode.setAttribute("data-light-devices", "");
    head.append(devicesNode);
    root.append(head);

    const sync = el("section", "light-card");
    const headRow = el("div", "light-line");
    headRow.append(el("h3", "", "Эффект"));
    const lampsBtn = el("button", "", lampSummary());
    lampsBtn.type = "button";
    lampsBtn.setAttribute("data-light-lamps", "");
    lampsBtn.title = "На каких лампах проявляется эффект";
    lampsBtn.addEventListener("click", function () { openLampPop(lampsBtn); });
    headRow.append(lampsBtn);
    sync.append(headRow);
    const row = el("div", "light-line");
    const auto = el("button", "", "Авто");
    auto.type = "button";
    auto.title = "Встроенный авторежим выбранных ламп";
    auto.addEventListener("click", function () {
      stopRun();
      const groups = groupsOf(selectedRows());
      if (!groups.length) { setStatus("Лампы не выбраны"); return; }
      groups.forEach(function (group) {
        try { if (group.device.auto) group.device.auto(true, group.whole ? null : group.ids); } catch (err) {}
      });
      setStatus("Авто");
    });
    const stop = el("button", "", "Стоп");
    stop.type = "button";
    stop.addEventListener("click", function () {
      stopRun();
      groupsOf(selectedRows()).forEach(function (group) {
        try { if (group.device.auto) group.device.auto(false, group.whole ? null : group.ids); } catch (err) {}
      });
      setStatus("Стоп");
    });
    row.append(auto, stop);
    sync.append(row);

    const fade = el("div", "light-line");
    const color = document.createElement("input");
    color.type = "color";
    color.className = "light-pick";
    color.value = hexOf(live.color);
    color.setAttribute("aria-label", "Цвет перехода");
    const seconds = document.createElement("input");
    seconds.type = "number";
    seconds.className = "light-num";
    seconds.min = "0.2";
    seconds.max = "120";
    seconds.step = "0.1";
    seconds.value = "4";
    seconds.setAttribute("aria-label", "Секунды перехода");
    const bright = document.createElement("input");
    bright.type = "range";
    bright.className = "light-grow";
    bright.min = "0";
    bright.max = "100";
    bright.value = String(Math.round(live.bright));
    bright.setAttribute("aria-label", "Яркость перехода");
    const go = el("button", "", "Переход");
    go.type = "button";
    go.addEventListener("click", function () {
      if (!selectedRows().length) { setStatus("Лампы не выбраны"); return; }
      stopRun();
      const mine = token;
      setStatus("Переход");
      runFade(parseHex(color.value), Number(bright.value) || 0, Number(seconds.value) || 1, "smooth", function () {
        if (mine === token) setStatus("Готово");
      });
    });
    fade.append(color, seconds, el("span", "light-unit", "с"), el("span", "light-unit", "Яркость"), bright, go);
    sync.append(fade);
    const status = el("p", "light-status", statusText);
    status.setAttribute("data-light-status", "");
    sync.append(status);
    root.append(sync);

    const presets = el("section", "light-card");
    presets.append(el("h3", "", "Циклы"));
    const tools = el("div", "light-line");
    const add = el("button", "", "Новый");
    add.type = "button";
    add.addEventListener("click", function () {
      const preset = {
        id: crypto.randomUUID(),
        name: "Цикл",
        loop: true,
        steps: [
          { color: "#e07030", seconds: 4, bright: 90, ease: "smooth" },
          { color: "#ffd27a", seconds: 1, bright: 100, ease: "sharp" },
          { color: "#6a2418", seconds: 4, bright: 25, ease: "smooth" }
        ]
      };
      data.presets.push(preset);
      data.selected = preset.id;
      persist();
      draw(root);
    });
    const file = document.createElement("input");
    file.type = "file";
    file.accept = "application/json,.json";
    file.hidden = true;
    const load = el("button", "", "Загрузить JSON");
    load.type = "button";
    load.addEventListener("click", function () { file.click(); });
    file.addEventListener("change", function () {
      const picked = file.files && file.files[0];
      file.value = "";
      if (!picked) return;
      picked.text().then(function (text) {
        let json = null;
        try { json = JSON.parse(text); } catch (err) { setStatus("Это не JSON"); return; }
        const rows = Array.isArray(json) ? json : json && json.presets;
        const next = (Array.isArray(rows) ? rows : []).map(cleanPreset).filter(Boolean).slice(0, 40);
        if (!next.length) { setStatus("В файле нет пресетов"); return; }
        stopRun();
        data.presets = next;
        data.selected = next[0].id;
        persist();
        setStatus("Загружено");
        draw(root);
      }).catch(function () { setStatus("Файл не прочитался"); });
    });
    const saveFile = el("button", "", "Выгрузить JSON");
    saveFile.type = "button";
    saveFile.addEventListener("click", function () {
      const payload = { version: 1, presets: data.presets.map(cleanPreset).filter(Boolean) };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "svet-presets.json";
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000);
    });
    tools.append(add, load, saveFile, file);
    presets.append(tools);

    if (!data.presets.length) {
      presets.append(el("p", "note", "Новый цикл: к цвету за несколько секунд, яркость плавно или резко. Круг идёт по лампам, отмеченным в окне эффекта."));
    }

    data.presets.forEach(function (preset) {
      const item = el("article", "light-preset" + (preset.id === (selectedPreset() && selectedPreset().id) ? " is-on" : ""));
      const title = el("div", "light-line");
      const name = document.createElement("input");
      name.type = "text";
      name.value = preset.name || "";
      name.setAttribute("aria-label", "Название пресета");
      name.addEventListener("input", function () {
        preset.name = name.value.slice(0, 80);
        persist();
      });
      const play = el("button", playingId === preset.id ? "is-on" : "", playingId === preset.id ? "Идёт" : "Играть");
      play.type = "button";
      play.setAttribute("data-light-play", preset.id);
      play.addEventListener("click", function () {
        data.selected = preset.id;
        playPreset(preset);
      });
      const loop = el("label", "light-check");
      const loopBox = document.createElement("input");
      loopBox.type = "checkbox";
      loopBox.checked = preset.loop !== false;
      loopBox.addEventListener("change", function () {
        preset.loop = loopBox.checked;
        persist();
      });
      loop.append(loopBox, document.createTextNode("По кругу"));
      const drop = el("button", "", "Удалить");
      drop.type = "button";
      drop.addEventListener("click", function () {
        if (playingId === preset.id) stopRun();
        data.presets = data.presets.filter(function (row) { return row.id !== preset.id; });
        if (data.selected === preset.id) data.selected = data.presets[0] ? data.presets[0].id : "";
        persist();
        draw(root);
      });
      title.append(name, play, loop, drop);
      item.append(title);

      (preset.steps || []).forEach(function (step, index) {
        const line = el("div", "light-step");
        const swatch = document.createElement("input");
        swatch.type = "color";
        swatch.className = "light-pick";
        swatch.value = /^#[0-9a-f]{6}$/i.test(step.color || "") ? step.color : "#ffffff";
        swatch.setAttribute("aria-label", "Цвет шага " + (index + 1));
        swatch.addEventListener("input", function () {
          step.color = swatch.value;
          persist();
        });
        const sec = document.createElement("input");
        sec.type = "number";
        sec.className = "light-num";
        sec.min = "0.2";
        sec.max = "120";
        sec.step = "0.1";
        sec.value = String(step.seconds || 1);
        sec.setAttribute("aria-label", "Секунды шага " + (index + 1));
        sec.addEventListener("change", function () {
          step.seconds = Math.max(0.2, Math.min(120, Number(sec.value) || 1));
          persist();
        });
        const level = document.createElement("input");
        level.type = "range";
        level.className = "light-grow";
        level.min = "0";
        level.max = "100";
        level.value = String(step.bright || 0);
        level.setAttribute("aria-label", "Яркость шага " + (index + 1));
        level.addEventListener("change", function () {
          step.bright = Math.max(0, Math.min(100, Math.round(Number(level.value) || 0)));
          persist();
        });
        const ease = document.createElement("select");
        ease.setAttribute("aria-label", "Яркость шага " + (index + 1));
        [["smooth", "Плавно"], ["sharp", "Резко"]].forEach(function (option) {
          const node = document.createElement("option");
          node.value = option[0];
          node.textContent = option[1];
          ease.append(node);
        });
        ease.value = step.ease === "sharp" ? "sharp" : "smooth";
        ease.addEventListener("change", function () {
          step.ease = ease.value === "sharp" ? "sharp" : "smooth";
          persist();
        });
        const remove = el("button", "", "×");
        remove.type = "button";
        remove.setAttribute("aria-label", "Убрать шаг " + (index + 1));
        remove.addEventListener("click", function () {
          preset.steps.splice(index, 1);
          persist();
          draw(root);
        });
        line.append(swatch, sec, el("span", "light-unit", "с"), el("span", "light-unit", "Яркость"), level, ease, remove);
        item.append(line);
      });

      const more = el("button", "", "Шаг");
      more.type = "button";
      more.addEventListener("click", function () {
        const prev = preset.steps[preset.steps.length - 1];
        preset.steps.push({
          color: prev ? prev.color : "#ffffff",
          seconds: 2,
          bright: prev ? prev.bright : 80,
          ease: "smooth"
        });
        persist();
        draw(root);
      });
      item.append(more);
      presets.append(item);
    });
    root.append(presets);
  }

  function paintCss() {
    if (document.getElementById("light-show-css")) return;
    const style = document.createElement("style");
    style.id = "light-show-css";
    style.textContent = [
      ".light-show { max-width: 760px; display: grid; gap: 14px; }",
      ".light-show h2 { margin: 0; font-weight: 500; font-size: 28px; }",
      ".light-show h3 { margin: 0; font-weight: 500; font-size: 16px; color: var(--muted); }",
      ".light-card { display: grid; gap: 10px; padding: 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); }",
      ".light-line, .light-step { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }",
      ".light-line .light-grow, .light-step .light-grow { flex: 1 1 80px; min-width: 0; width: auto; }",
      ".light-show input[type='color'], .light-pick { width: 42px; height: 32px; padding: 2px; flex: none; }",
      ".light-num { width: 4.8em; padding: 6px 8px; }",
      ".light-unit { color: var(--muted); }",
      ".light-check { display: flex; gap: 6px; align-items: center; }",
      ".light-preset { display: grid; gap: 8px; padding-top: 8px; border-top: 1px solid var(--line); }",
      ".light-preset input[type='text'] { flex: 1; min-width: 120px; }",
      ".light-status { margin: 0; min-height: 1.2em; color: var(--muted); }",
      ".light-pop { position: fixed; z-index: 60; display: grid; gap: 8px; width: 260px; padding: 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--panel); box-shadow: 0 12px 40px rgba(0,0,0,.35); }",
      ".light-pop h3 { margin: 0; }"
    ].join("\n");
    document.head.appendChild(style);
  }

  function mount(host, next) {
    ctx = next || ctx;
    if (!host) return;
    paintCss();
    let root = host.querySelector(".light-show");
    if (!root) {
      host.innerHTML = "";
      root = document.createElement("div");
      root.className = "light-show";
      host.append(root);
    }
    draw(root);
    clearInterval(watch);
    watch = setInterval(function () {
      if (!root.isConnected) {
        clearInterval(watch);
        return;
      }
      const line = root.querySelector("[data-light-devices]");
      if (line) line.textContent = deviceLine();
    }, 1500);
  }

  function install(host) {
    host.add({
      id: "light-show",
      module: {
        title: "Свет",
        icon: '<circle cx="12" cy="9" r="3.2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 13.2h4M10.6 16h2.8M12 12.2v1" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
        mount: mount,
        stop: stopRun
      }
    });
  }

  if (window.ShirmoHost) install(window.ShirmoHost);
  else window.addEventListener("shirmo-host", function () { install(window.ShirmoHost); }, { once: true });
})();
