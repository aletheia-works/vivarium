# motionEye #3506 — a manual detection change outlasts the schedule

[motioneye-project/motioneye#3506](https://github.com/motioneye-project/motioneye/pull/3506)
keeps a manual pause or start of motion detection until the working
schedule changes. Before it, wsswitch set the scheduled state again within
10 seconds.

## Checking it in the preview

1. Log in as `admin` with the password `password`.
2. Open a camera's settings. Under **Motion Detection**, turn on **Motion
   detection toggle button**. Turn on **Working Schedule**, set every day to
   00:00–23:59, choose **During Working Schedule**, and apply.
3. Pause motion detection with the camera's detection button.
4. Wait 30 seconds. With the PR the camera stays paused, and the button
   offers to start detection; without it, detection is active again.
