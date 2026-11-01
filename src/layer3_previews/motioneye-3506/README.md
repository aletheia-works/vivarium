# motionEye #3506 — a manual detection change outlasts the schedule

[motioneye-project/motioneye#3506](https://github.com/motioneye-project/motioneye/pull/3506)
keeps a manual pause or start of motion detection until the working
schedule changes. Before it, wsswitch set the scheduled state again within
10 seconds.

## Checking it in the preview

1. Open a camera's settings, turn on **Working Schedule**, set every day to
   all day, choose **Detect motion during working schedule**, and apply.
2. Pause motion detection with the camera's detection button.
3. Wait 30 seconds. With the PR the camera stays paused; without it,
   detection is active again.
