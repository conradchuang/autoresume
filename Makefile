VERSION= $(shell grep \"version\" manifest.json | sed "s/.*: \"\(.*\)\".*/\1/")
FILES=	manifest.json \
	background.js \
	icons \
	popup \
	options
IGNORE=	icons/autoresume-512.png

# Description to use in Firefox extension descriptor
DESC=	When a download is interrupted, this extension checks whether it can be resumed. If so, it can automatically restarted after a short wait interval. Notifications, logging and wait interval can all be adjusted via extension options.


dist:
	# Create .zip instead of .xpi since it will need to be validated
	# and signed before it can be used as extension file.
	# zip updates an existing archive by default
	# -r = recurse
	# -Z = compression method
	# -D = no directory entries
	rm -f autoresume-$(VERSION).zip
	zip -r -Z deflate -D autoresume-$(VERSION).zip $(FILES) -x $(IGNORE)

clean:
	rm -f autoresume-*.zip
