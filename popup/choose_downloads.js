//
// vim: set expandtab ts=4 sw=4:
//

// console.debug("init popup");

// These must match same constants in background.js
const alarmPrefix = "autoresume-";
const alarmMonitor = alarmPrefix + "monitor";
const alarmPopup = alarmPrefix + "popup";

// console.debug("autoresume: init popup script");

function downloadCB(ev) {
    let el = ev.target;
    let msg = {
        command: "update",
        selected: el.checked,
        id: el.value,
    };
    return browser.runtime.sendMessage(msg);
    // console.info("autoresume: sent update");
    // console.debug(msg);
}

function displaySize(value, divisor) {
    let v = value / divisor;
    // parseFloat will remove trailing 0s
    return Number.parseFloat(v.toPrecision(3));
}

function displayUnit(value) {
    let divisor, unit;
    if (value >= 1000000000) {
        divisor = 1000000000;
        unit = "GB";
    } else if (value >= 1000000) {
        divisor = 1000000;
        unit = "MB";
    } else if (value >= 1000) {
        divisor = 1000;
        unit = "KB";
    } else {
        divisor = 1;
        unit = "B";
    }
    return {
        divisor: divisor,
        unit: unit
    };
}

function showDownloads(downloads, dlInfo, options) {
    let activeDownloads = document.body.querySelector(".active-downloads");
    activeDownloads.replaceChildren();
    let count = 0;
    for (let dl of downloads) {
        let dlId = dl.id.toString();
        let info = dlInfo[dlId];
        if (!info)
            continue;
        // If download is not in progress and cannot be resumed,
        // we do not bother to display it.
        if (dl.state == "in_progress") {
            let row = buildDownloadInProgress(info, dlId, dl);
            activeDownloads.appendChild(row);
            count += 1;
        } else if (dl.state == "complete") {
            let row = buildDownloadComplete(info, dlId, dl);
            activeDownloads.appendChild(row);
            count += 1;
        } else if (dl.state == "interrupted") {
            let row = buildDownloadInterrupted(info, dlId, dl);
            activeDownloads.appendChild(row);
            count += 1;
        }
    }
    if (count == 0) {
        let row = document.createElement("div");
        row.textContent = "No active downloads.";
        row.className = "download-row";
        activeDownloads.appendChild(row);
    }
}

function buildStatus(info, dlId, resumable, state_img) {
    let row = document.createElement("div");
    row.className = "download-row";
    let status = document.createElement("div");
    status.className = "download-status";
    let checkbox = document.createElement("input");
    checkbox.setAttribute("type", "checkbox");
    checkbox.value = dlId;
    checkbox.className = "autoresume";
    if (resumable)
        checkbox.checked = info.auto;
    else {
        checkbox.checked = false;
        checkbox.disabled = true;
    }
    checkbox.addEventListener("change", downloadCB);
    status.appendChild(checkbox);
    let img = document.createElement("img");
    img.className = "download-state";
    img.src = state_img;
    status.appendChild(img);
    row.appendChild(status);
    return row;
}

function buildFileInfo(dl) {
    let filename = dl.filename.replace(/^.*[\\\/]/, '');
    let label = document.createElement("div");
    label.className = "download-label";
    let fn = document.createElement("div");
    fn.textContent = filename;
    fn.className = "download-filename";
    label.appendChild(fn);
    return label;
}

function rateToTime(bytes, rate) {
    let secondsLeft = Math.trunc(bytes / rate);
    let minutesLeft = Math.trunc(secondsLeft / 60);
    let hoursLeft = Math.trunc(minutesLeft / 60);
    let t = "";
    if (hoursLeft) {
        t += hoursLeft + "h ";
        minutesLeft -= hoursLeft * 60;
    }
    if (minutesLeft)
        t += minutesLeft + "m ";
    if (!t)
        t = secondsLeft + "s ";
    return t;
}

function buildTimeInfo(initTime, initSize, curTime, curSize, targetSize) {
    let dlTime = (curTime - initTime) / 1000;
    let dlRate = (curSize - initSize) / dlTime;    // B/sec
    let rate = "";
    if (dlRate > 1000000)
        rate += (dlRate / 1000000).toFixed(1) + " MB/s";
    else if (dlRate > 1000)
        rate += (dlRate / 1000).toFixed(0) + " kB/s";
    else
        rate += dlRate.toFixed(0) + " B/s";
    if (!targetSize)
        return rate;
    let msg;
    if (targetSize > curSize) {
        // Still downloading
        let rem = rateToTime(targetSize - curSize, dlRate) + "left";
        let pct = Math.round(curSize / targetSize * 100);
        let ru = displayUnit(curSize);
        let recv = displaySize(curSize, ru.divisor);
        let tu = displayUnit(targetSize);
        let total = displaySize(targetSize, tu.divisor);
        msg = rem + " \u2013 " + recv + ru.unit + " of " +
                  total + tu.unit + ", " + pct + "% @ " + rate;
    } else {
        msg = "downloaded in " + rateToTime(targetSize, dlRate);
    }
    let ti = document.createElement("div");
    ti.textContent = msg;
    ti.className = "download-rate";
    return ti;
}

function buildDownloadInProgress(info, dlId, dl) {
    let row = buildStatus(info, dlId, info.auto,
                          "../icons/status-running.png");
    let label = buildFileInfo(dl);
    // img.src = "../icons/status-stopped.png";
    // Estimate the download rate and time remaining
    // using the overall rate so far
    let now = new Date();
    let start = new Date(info.initTime);
    let ti = buildTimeInfo(start, info.initSize,
                           now, dl.bytesReceived, dl.totalBytes);
    label.appendChild(ti);
    row.appendChild(label);
    return row;
}

function buildDownloadComplete(info, dlId, dl) {
    let row = buildStatus(info, dlId, false,
                          "../icons/autoresume-96.png");
    let label = buildFileInfo(dl);
    // Calculate the download rate and time spent
    let end = new Date(info.endTime);
    let start = new Date(info.initTime);
    let ti = buildTimeInfo(start, info.initSize,
                           end, dl.bytesReceived, dl.totalBytes);
    label.appendChild(ti);
    row.appendChild(label);
    return row;
}

function buildDownloadInterrupted(info, dlId, dl) {
    let row = buildStatus(info, dlId, dl.canResume,
                          "../icons/status-stopped.png");
    let label = buildFileInfo(dl);
    // img.src = "../icons/status-stopped.png";
    // Estimate the download rate and time remaining
    // using the overall rate so far
    let end = new Date(info.interruptTime);
    let start = new Date(info.initTime);
    let ti = buildTimeInfo(start, info.initSize,
                           end, dl.bytesReceived, dl.totalBytes);
    label.appendChild(ti);
    row.appendChild(label);
    return row;
}

// console.debug("loading");

document.getElementById("options").addEventListener("click", (ev) => {
    browser.runtime.openOptionsPage();
});

browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    // console.info("autoresume: popup received command: " +
    //              msg.command);
    // console.debug(msg);
    if (msg.command == "show-downloads") {
        showDownloads(msg.downloads, msg.auto, msg.options);
    }
    sendResponse(true);
    return true;
});

// Create a port so that background script can detect
// when we go away
const port = browser.runtime.connect({ name: alarmPopup });

// console.debug("finished init popup");
