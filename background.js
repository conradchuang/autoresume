//
// vim: set autoindent expandtab ts=4 sw=4 sts=4:
//

(function() {

    var autoresumeIds = {}
    // value for options should match those in popup/choose_downloads.html
    var options = {
            auto:true,
            logEvents:true,
            notifyResume:false,
            notifyInterrupt:false,
            interval:30
    };
    var notificationId = "Auto Resume Notification";
    var alarmPrefix = "autoresume-";
    var prerelease = browser.runtime.getManifest().version.includes("pre");

    if (prerelease)
        console.info("autoresume: init background script");

    function reloadDownloads() {
        let query = {"orderBy": ["-startTime"]};
        let allDownloads = browser.downloads.search(query);
        function show(dls) {
            msg = {command:"show-downloads",
                   downloads:dls,
                   auto:autoresumeIds,
                   options:options};
            browser.runtime.sendMessage(msg);
        }
        allDownloads.then(show, onError);
    }

    function reloadOptions() {
        msg = {command:"show-options",
               options:options};
        browser.runtime.sendMessage(msg);
    }

    function onResume() {
        if (prerelease)
            console.log("autoresume: download resumed");
    }

    function onError(error) {
        console.error("autoresume: " + error.message);
    }

    function basename(path) {
        return path.replace(/^.*[\\\/]/, '');
    }

    function clearCompleteDownloads() {
        browser.downloads.search({}).then((dls) => {
            let changed = false;
            for (let dl of dls) {
                if (dl.state == "complete") {
                    let dlId = dl.id.toString();
                    if (dlId in autoresumeIds) {
                        delete autoresumeIds[dlId];
                        changed = true;
                    }
                }
            }
            if (changed)
                browser.storage.local.set({autoresume:autoresumeIds});
        });
    }

    browser.runtime.onMessage.addListener((msg) => {
        if (prerelease) {
            console.info("autoresume: background received command: " +
                         msg.command);
            // console.debug(msg);
        }
        if (msg.command == "popup") {
            // Send "show-downloads" message with latest list of downloads.
            reloadDownloads();
        } else if (msg.command == "update") {
            // Remove download id from autoresume list if not selected.
            // Add if selected.
            if (autoresumeIds[msg.id] !== msg.selected) {
                autoresumeIds[msg.id] = msg.selected;
                browser.storage.local.set({autoresume:autoresumeIds});
            }
        } else if (msg.command == "options") {
            // Send "show-options" message with current options.
            reloadOptions();
        } else if (msg.command == "option-auto") {
            options.auto = msg.selected;
            browser.storage.local.set({options:options});
        } else if (msg.command == "option-log-events") {
            options.logEvents = msg.selected;
            browser.storage.local.set({options:options});
        } else if (msg.command == "option-notify-resume") {
            options.notifyResume = msg.selected;
            browser.storage.local.set({options:options});
        } else if (msg.command == "option-notify-interrupt") {
            options.notifyInterrupt = msg.selected;
            browser.storage.local.set({options:options});
        } else if (msg.command == "option-interval") {
            let interval = parseInt(msg.value);
            // Should match option.html limits
            if (!isNaN(interval) && interval >= 5 && interval <= 600) {
                options.interval = interval
                browser.storage.local.set({options:options});
            }
        }
    });

    // Listen for download stopped/paused/failed events
    // and automatically resume if possible.

    browser.downloads.onCreated.addListener((dl) => {
        if (prerelease) {
            console.info("autoresume: download created: " +
                         basename(dl.filename));
            console.debug(dl);
        }
        let dlId = dl.id.toString();
        autoresumeIds[dlId] = options.auto;
        if (options.auto)
            browser.storage.local.set({autoresume:autoresumeIds});
        reloadDownloads();
    });

    browser.downloads.onChanged.addListener((dlDelta) => {
        if (!dlDelta.state)
            return;
        if (prerelease)
            console.info("autoresume: download changed: " +
                         dlDelta.id + ": " +
                         dlDelta.state.previous + " -> " +
                         dlDelta.state.current);
        if (dlDelta.state.current == "complete") {
            // Remove from autoresume list
            let dlId = dlDelta.id.toString();
            if (dlId in autoresumeIds) {
                delete autoresumeIds[dlId];
                browser.storage.local.set({autoresume:autoresumeIds});
            }
            reloadDownloads();
        } else if (dlDelta.state.current == "interrupted") {
            // If a download is interrupted, see if we can restart it
            let interval = options.interval / 60.0;
            let name = alarmPrefix + dlDelta.id.toString();
            browser.alarms.create(name, {delayInMinutes:interval});
            if (prerelease) {
                console.debug("autoresume: download " + dlDelta.id.toString() +
                              " interrupted at " + 
                              new Date().toLocaleTimeString());
                console.debug(dlDelta);
            }
            if (options.notifyInterrupt || options.logEvents) {
                browser.downloads.search({id:dlDelta.id}).then((dls) => {
                    if (prerelease) {
                        console.debug("autoresume: notify interrupt");
                        console.debug(dls);
                    }
                    if (dls.length == 0)
                        return;
                    let dl = dls[0];
                    let msg = "Download for " + basename(dl.filename) +
                             " interrupted at " +
                             new Date().toLocaleTimeString();
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

    browser.alarms.onAlarm.addListener((alarmInfo) => {
        if (prerelease)
            console.debug("autoresume: alarm");
        if (!alarmInfo.name.startsWith(alarmPrefix))
            return;
        let id = parseInt(alarmInfo.name.substring(alarmPrefix.length));
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

    // Restore options state
    browser.storage.local.get({'options':options}, (result) => {
        for (let opt in result.options)
            options[opt] = result.options[opt];
    });

    // Restore list of monitored downloads
    browser.storage.local.get({'autoresume':autoresumeIds}, (result) => {
        if (prerelease)
            console.info("autoresume: restored state");
        autoresumeIds = result.autoresume;
        browser.downloads.search({}).then((dls) => {
            let changed = false;
            // Remove all no-longer-present or complete downloads
            for (let dlId in autoresumeIds) {
                let dl = dls.find((d) => d.id.toString() == dlId);
                if (!dl || dl.state == "complete") {
                    delete autoresumeIds[dlId];
                    changed = true;
                }
            }
            // Add any new downloads if automatic-resume is on
            for (let dl of dls) {
                if (dl.state != "complete") {
                    let dlId = dl.id.toString();
                    if (!(dlId in autoresumeIds)) {
                        autoresumeIds[dlId] = options.auto;
                        changed = true;
                    }
                }
            }
            if (changed)
                browser.storage.local.set({autoresume:autoresumeIds});
        });
    });

})();
