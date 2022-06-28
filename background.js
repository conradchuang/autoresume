//
// vim: set expandtab ts=4 sw=4:
//

(function() {

    console.info("autoresume: init background script");
    var autoresumeIds = [];
    var options = {auto:true, notify:false};

    function reloadDownloads() {
        let query = {"orderBy": ["-startTime"]};
        let allDownloads = browser.downloads.search(query);
        function show(dls) {
            // debug code
            // dls = [{id:12, filename:"hello.png"},
            //        {id:13, filename:"world.gif"}];
            msg = {command:"show",
                   downloads:dls,
                   auto:autoresumeIds,
                   options:options};
            browser.runtime.sendMessage(msg);
        }
        allDownloads.then(show, onError);
    }

    function onResume() {
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
        console.info("autoresume: background received command: " + msg.command);
        console.debug(msg);
        if (msg.command == "popup") {
            // Send "show" message with latest list of downloads.
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
        } else if (msg.command == "option-auto") {
            options.auto = msg.selected;
            browser.storage.local.set({options:options});
        } else if (msg.command == "option-notify-resume") {
            options.notify = msg.selected;
            browser.storage.local.set({options:options});
        }
    });

    // Listen for download stopped/paused/failed events
    // and automatically resume if possible.

    browser.downloads.onCreated.addListener((dl) => {
        console.info("autoresume: download created: " + basename(dl.filename));
        console.debug(dl);
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
        console.info("autoresume: download changed: " + dlDelta.id + ": " +
                    dlDelta.state.previous + " -> " + dlDelta.state.current);
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
            browser.alarms.create("autoresume", {delayInMinutes:0.5});
        }
    });

    browser.alarms.onAlarm.addListener((alarmInfo) => {
        console.debug("autoresume: alarm");
        if (alarmInfo.name != "autoresume")
            return;
        browser.downloads.search({}).then((dls) => {
            for (let dlId of autoresumeIds) {
                let dl = dls.find((d) => d.id.toString() == dlId &&
                                         d.state == "interrupted" &&
                                         d.canResume);
                if (dl) {
                    console.debug("autoresume: resume: " +
                                  basename(dl.filename));
                    if (options.notify) {
                        let n = {type:"basic",
                                 iconUrl:"icons/autoresume-96.png",
                                 title:"Download Resumed",
                                 message:"Download for " +
                                         basename(dl.filename) +
                                         " resumed at " +
                                         new Date().toLocaleTimeString()};
                        let nid = "Auto Resume Notification"
                        browser.notifications.create(nid, n);
                    }
                    browser.downloads.resume(dl.id).then(onResume, onError);
                }
            }
        });
    });

    browser.storage.local.get({'autoresume':autoresumeIds,
                               'options':options}, (result) => {
        console.info("autoresume: restored state");
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
