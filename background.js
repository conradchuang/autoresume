//
// vim: set autoindent expandtab ts=4 sw=4 sts=4:
//

(function() {

    // console.info("autoresume: init background script");

    var autoresumeIds = [];
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

    function reloadDownloads() {
        let query = {"orderBy": ["-startTime"]};
        let allDownloads = browser.downloads.search(query);
        function show(dls) {
            // debug code
            // dls = [{id:12, filename:"hello.png"},
            //        {id:13, filename:"world.gif"}];
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
        // console.log("autoresume: download resumed");
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
                    let n = autoresumeIds.indexOf(dl.id.toString());
                    if (n != -1) {
                        autoresumeIds.splice(n, 1);
                        changed = true;
                    }
                }
            }
            if (changed)
                browser.storage.local.set({autoresume:autoresumeIds});
        });
    }

    browser.runtime.onMessage.addListener((msg) => {
        // console.info("autoresume: background received command: " +
        //              msg.command);
        // console.debug(msg);
        if (msg.command == "popup") {
            // Send "show-downloads" message with latest list of downloads.
            reloadDownloads();
        } else if (msg.command == "update") {
            // Remove download id from autoresume list if not selected.
            // Add if selected.
            let changed = false;
            let n = autoresumeIds.indexOf(msg.id);
            if (msg.selected) {
                if (n == -1) {
                    autoresumeIds.push(msg.id);
                    changed = true;
                }
            } else {
                if (n != -1) {
                    autoresumeIds.splice(n, 1);
                    changed = true;
                }
            }
            if (changed)
                browser.storage.local.set({autoresume:autoresumeIds});
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
        // console.info("autoresume: download created: " +
        //              basename(dl.filename));
        // console.debug(dl);
        if (options.auto) {
            let dlId = dl.id.toString();
            autoresumeIds.push(dlId);
            browser.storage.local.set({autoresume:autoresumeIds});
            reloadDownloads();
        }
    });

    // Assuming that we will get an onChanged event to "complete" state
    // before a download gets erased, we do not need to do anything
    // at actual erasure.
    /*
    browser.downloads.onErased.addListener((dlId) => {
        // console.info("autoresume: download erased: " + dlId);
        let n = autoresumeIds.indexOf(dlId.toString());
        if (n != -1) {
            autoresumeIds.splice(n, 1);
            browser.storage.local.set({autoresume:autoresumeIds});
            reloadDownloads();
        }
    });
    */

    browser.downloads.onChanged.addListener((dlDelta) => {
        if (!dlDelta.state)
            return;
        // console.info("autoresume: download changed: " +
        //              dlDelta.id + ": " +
        //              dlDelta.state.previous + " -> " +
        //              dlDelta.state.current);
        if (dlDelta.state.current == "complete") {
            // Remove from autoresume list
            let n = autoresumeIds.indexOf(dlDelta.id.toString());
            if (n != -1) {
                autoresumeIds.splice(n, 1);
                browser.storage.local.set({autoresume:autoresumeIds});
                reloadDownloads();
            }
        } else if (dlDelta.state.current == "interrupted") {
            // If a download is interrupted, see if we can restart it
            let interval = options.interval / 60.0;
            let name = alarmPrefix + dlDelta.id.toString();
            browser.alarms.create(name, {delayInMinutes:interval});
            // console.debug("autoresume: download " + dlDelta.id.toString() +
            //               " interrupted at " + 
            //               new Date().toLocaleTimeString());
            // console.debug(dlDelta);
            if (options.notifyInterrupt || options.logEvents) {
                browser.downloads.search({id:dlDelta.id}).then((dls) => {
                    // console.debug("autoresume: notify interrupt");
                    // console.debug(dls);
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
        // console.debug("autoresume: alarm");
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

    browser.storage.local.get({'autoresume':autoresumeIds,
                               'options':options}, (result) => {
        // console.info("autoresume: restored state");
        autoresumeIds = result.autoresume;
        for (let opt in result.options)
            options[opt] = result.options[opt];

        browser.downloads.search({}).then((dls) => {
            let changed = false;
            // Remove any no-longer-present download
            for (let i = autoresumeIds.length - 1; i >= 0; i--) {
                let dlId = autoresumeIds[i];
                let dl = dls.find((d) => d.id.toString() == dlId);
                if (!dl) {
                    autoresumeIds.splice(i, 1);
                    changed = true;
                }
            }
            // Add any new downloads if automatic-resume is on
            if (options.auto) {
                for (let dl of dls) {
                    let dlId = dl.id.toString();
                    if (dl.state != "complete" &&
                        autoresumeIds.indexOf(dlId) == -1) {
                            autoresumeIds.push(dlId);
                            changed = true;
                        }
                }
            }
            if (changed)
                browser.storage.local.set({autoresume:autoresumeIds});
        });
    });

})();
