//
// vim: set autoindent expandtab ts=4 sw=4 sts=4:
//

// console.debug("autoresume: init background script");

const alarmPrefix = "autoresume-";
const alarmMonitor = alarmPrefix + "monitor";
const alarmPopup = alarmPrefix + "popup";
const notificationId = "Auto Resume Notification";

// Restore options state
async function getSavedOptions() {
    // value for options should match those in popup/choose_downloads.html
    let options = {
            auto:true,
            logEvents:true,
            notifyResume:false,
            notifyInterrupt:false,
            interval:30,
            monitorInterval:0,
            debug:browser.runtime.getManifest().version.includes("pre")
    };
    let result = await browser.storage.local.get({'options':options});
    for (let opt in result.options)
        options[opt] = result.options[opt];
    return options;
}

// Restore list of monitored downloads
async function getSavedIds(options) {
    let result = await browser.storage.local.get({'autoresume':{}});
    if (options.debug)
        console.debug("autoresume: recovered ids");
    let ids = result.autoresume;
    let dls = await browser.downloads.search({});
    let changed = false;
    // Remove all no-longer-present or complete downloads
    for (let dlId in ids) {
        let dl = dls.find((d) => d.id.toString() == dlId);
        if (!dl || dl.state == "complete") {
            delete ids[dlId];
            changed = true;
        }
    }
    // Add any new downloads if automatic-resume is on
    for (let dl of dls) {
        if (dl.state != "complete") {
            let dlId = dl.id.toString();
            if (!(dlId in ids)) {
                ids[dlId] = options.auto;
                changed = true;
            }
        }
    }
    if (changed)
        await browser.storage.local.set({autoresume:ids});
    return ids;
}

async function reloadDownloads(options, ids) {
    let query = {"orderBy": ["-startTime"]};
    async function show(dls) {
        let msg = {command:"show-downloads",
                   downloads:dls,
                   auto:ids,
                   options:options};
        await browser.runtime.sendMessage(msg).then(ignore, ignore);
    }
    await browser.downloads.search(query).then(show, onError);
}

async function reloadOptions(options) {
    msg = {command:"show-options",
           options:options};
    await browser.runtime.sendMessage(msg).then(ignore, ignore);
}

function ignore(value) {
    return;
}

function onResume() {
    let options = getSavedOptions();
    if (options.debug)
        console.log("autoresume: download resumed");
}

function onError(error) {
    console.error("autoresume: " + error.message);
}

function basename(path) {
    return path.replace(/^.*[\\\/]/, '');
}

browser.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
    let options = await getSavedOptions();
    if (options.debug) {
        console.info("autoresume: background received command: " + msg.command);
        // console.debug(msg);
    }
    if (msg.command == "popup") {
        // Send "show-downloads" message with latest list of downloads.
        let ids = await getSavedIds(options);
        await reloadDownloads(options, ids);
    } else if (msg.command == "update") {
        // Remove download id from autoresume list if not selected.
        // Add if selected.
        let ids = await getSavedIds(options);
        if (ids[msg.id] !== msg.selected) {
            ids[msg.id] = msg.selected;
            await browser.storage.local.set({autoresume:ids});
        }
    } else if (msg.command == "options") {
        // Send "show-options" message with current options.
        await reloadOptions(options);
    } else if (msg.command == "option-auto") {
        options.auto = msg.selected;
        await browser.storage.local.set({options:options});
    } else if (msg.command == "option-log-events") {
        options.logEvents = msg.selected;
        await browser.storage.local.set({options:options});
    } else if (msg.command == "option-notify-resume") {
        options.notifyResume = msg.selected;
        await browser.storage.local.set({options:options});
    } else if (msg.command == "option-notify-interrupt") {
        options.notifyInterrupt = msg.selected;
        await browser.storage.local.set({options:options});
    } else if (msg.command == "option-interval") {
        let interval = parseInt(msg.value);
        // Should match option.html limits
        if (!isNaN(interval) && interval >= 5 && interval <= 600) {
            options.interval = interval
            await browser.storage.local.set({options:options});
        }
    } else if (msg.command == "option-monitor-interval") {
        let interval = parseInt(msg.value);
        // Should match option.html limits
        if (!isNaN(interval) && interval >= 0 && interval <= 3600) {
            if (interval != options.monitorInterval) {
                options.monitorInterval = interval
                browser.storage.local.set({options:options}).then(() => {
                    if (options.debug) {
                        if (interval)
                            console.debug("monitor alarm: " + interval + "s");
                        else
                            console.debug("monitor alarm: off");
                    }
                });
                let ids = await getSavedIds(options);
                await reloadDownloads(options, ids);
            }
        }
    } else if (msg.command == "option-notify-debug") {
        options.debug = msg.selected;
        await browser.storage.local.set({options:options});
    }
    sendResponse(true);
    return true;
});

// Listen for download stopped/paused/failed events
// and automatically resume if possible.

browser.downloads.onCreated.addListener(async (dl) => {
    let options = await getSavedOptions();
    if (options.debug) {
        console.info("autoresume: download created: " +
                     basename(dl.filename));
        console.debug(dl);
    }
    let ids = await getSavedIds(options);
    let dlId = dl.id.toString();
    ids[dlId] = options.auto;
    if (options.auto)
        await browser.storage.local.set({autoresume:ids});
    await reloadDownloads(options, ids);
});

browser.downloads.onChanged.addListener(async (dlDelta) => {
    if (!dlDelta.state)
        return;
    let options = await getSavedOptions();
    if (options.debug)
        console.info("autoresume: download changed: " +
                     dlDelta.id + ": " +
                     dlDelta.state.previous + " -> " +
                     dlDelta.state.current);
    if (dlDelta.state.current == "complete") {
        // Remove from autoresume list
        let ids = await getSavedIds(options);
        let dlId = dlDelta.id.toString();
        if (dlId in ids) {
            delete ids[dlId];
            await browser.storage.local.set({autoresume:ids});
        }
        await reloadDownloads(options);
    } else if (dlDelta.state.current == "interrupted") {
        // If a download is interrupted, see if we can restart it
        let interval = options.interval / 60.0;
        let name = alarmPrefix + dlDelta.id.toString();
        browser.alarms.create(name, {delayInMinutes:interval});
        if (options.debug) {
            console.info("autoresume: download " + dlDelta.id.toString() +
                          " interrupted at " + 
                          new Date().toLocaleTimeString());
            console.debug(dlDelta);
        }
        if (options.notifyInterrupt || options.logEvents) {
            browser.downloads.search({id:dlDelta.id}).then((dls) => {
                if (options.debug) {
                    console.debug("autoresume: notify interrupt");
                    console.debug(dls);
                }
                if (dls.length == 0)
                    return;
                let dl = dls[0];
                let msg = "Download for " + basename(dl.filename) +
                         " interrupted at " +
                         new Date().toLocaleTimeString();
                if (dl.error)
                    msg += " (" + dl.error + ")";
                if (options.notifyInterrupt) {
                    let n = {type:"basic",
                             iconUrl:"icons/autoresume-96.png",
                             title:"Download Resumed",
                             message:msg};
                    browser.notifications.create(notificationId, n);
                }
                if (options.logEvents)
                    console.log("autoresume: " + msg);
            });
        }
    }
});

browser.alarms.onAlarm.addListener(async (alarmInfo) => {
    let options = await getSavedOptions();
    if (options.debug)
        console.debug("autoresume: received alarm: " + alarmInfo.name);
    if (!alarmInfo.name.startsWith(alarmPrefix))
        return;
    if (alarmInfo.name == alarmMonitor) {
        if (options.logEvents)
            console.info("autoresume: update download rates");
        let ids = await getSavedIds(options);
        await reloadDownloads(options, ids);
        return;
    }
    let name = alarmInfo.name.substring(alarmPrefix.length);
    let id = parseInt(name);
    browser.downloads.search({id:id}).then((dls) => {
        // There should only be one item in dls array
        for (let dl of dls) {
            if (dl.state == "interrupted" && dl.canResume) {
                if (options.notifyResume || options.logEvents) {
                    let msg = "Download for " + basename(dl.filename) +
                              " resumed at " +
                              new Date().toLocaleTimeString();
                    if (options.notifyResume) {
                        let n = {type:"basic",
                                 iconUrl:"icons/autoresume-96.png",
                                 title:"Download Resumed",
                                 message:msg};
                        browser.notifications.create(notificationId, n);
                    }
                    if (options.logEvents)
                        console.log("autoresume: " + msg);
                }
                browser.downloads.resume(dl.id).then(onResume, onError);
            }
        }
    });
});

// Popup script creates a port when it starts up.
// We use its life cycle to update and clean up as needed.
browser.runtime.onConnect.addListener((port) => {
    if (port.name === alarmPopup) {
        // console.log("popup created");
        port.onDisconnect.addListener(() => {
            // console.log("popup died");
            browser.alarms.clear(alarmMonitor);
            return true;
        });
        getSavedOptions().then((options) => {
            getSavedIds(options).then((ids) => {
                reloadDownloads(options, ids);
            });
        });
    }
});
