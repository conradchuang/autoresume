var testData = "Init";
(function() {
	console.log("init background script: " + testData);
	browser.runtime.onMessage.addListener((message) => {
		if (message.command == "test") {
			console.log("received test: cached data: " + testData);
			console.log(message);
			testData = "Changed";
		} else if (message.command == "") {
		}
	});
})();
