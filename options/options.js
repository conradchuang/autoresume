//
// vim: set expandtab ts=4 sw=4:
//

(function() {

    // console.info("autoresume: init options script");

    function optionCheckboxCB(ev) {
        let el = ev.target;
        let msg = {
            command: el.id,
            selected: el.checked,
        };
        browser.runtime.sendMessage(msg).then(value => {});
    }

    function optionNotifyCB(ev) {
        let perm = {"permissions":["notifications"]};
        browser.permissions.request(perm).then((allowed) => {
            if (allowed) {
                // console.debug("notifications permission granted");
                optionCheckboxCB(ev);
            } else {
                // console.debug("notifications permission denied");
                ev.target.checked = false;
            }
        });
    }

    function optionNumberCB(ev) {
        let el = ev.target;
        let msg = {
            command: el.id,
            value: el.value,
        };
        browser.runtime.sendMessage(msg).then(value => {});
    }

    function showOptions(options) {
        function e(name) {
            return document.getElementById(name);
        }
        // Display option states
        e("option-auto").checked = options.auto;
        e("option-log-events").checked = options.logEvents;
        e("option-notify-resume").checked = options.notifyResume;
        e("option-notify-interrupt").checked = options.notifyInterrupt;
        e("option-interval").value = options.interval;
    }

    window.addEventListener("load", (event) => {
        document.getElementById("option-auto")
                .addEventListener("change", optionCheckboxCB);
        document.getElementById("option-log-events")
                .addEventListener("change", optionCheckboxCB);
        document.getElementById("option-notify-resume")
                .addEventListener("change", optionNotifyCB);
        document.getElementById("option-notify-interrupt")
                .addEventListener("change", optionNotifyCB);
        document.getElementById("option-interval")
                .addEventListener("input", optionNumberCB);

        browser.runtime.onMessage.addListener((msg) => {
            // console.info("autoresume: options received command: " +
            //              msg.command);
            // console.debug(msg);
            if (msg.command == "show-options")
                showOptions(msg.options);
        });
        browser.runtime.sendMessage({command:"options"}).then(value => {});
    });

})();
