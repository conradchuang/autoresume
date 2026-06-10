# autoresume
Firefox extension for automatically resuming interrupted downloads.

When the extension is selected, it displays a list of active
downloads.  Each download has a checkbox, its state, its filename
(excluding the folder path), and, optionally, the download rate.
(The remaining time and download rate are computed from the total
number of bytes received divided by the total elapased time.  This
estimate is sometimes wildly different than what the download panel
reports).

The user can select the checkbox next to a download entry to indicate
that the extension should try to resume the download if it is interrupted.
If it can be resumed, the download is automatically restarted
after a short wait interval.

The extension settings may be used to adjust options for notifications,
logging and wait interval, etc.
