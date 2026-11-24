# Functions and logic

## Read screenshots

Function fn_read. Trigger: Read them. Inputs: none. Preconditions: none. Permissions: any. Data: write Screenshot details. Output: none. Errors: Show what could not be read.

Steps:
1. Read the text in each screenshot
2. Find names, dates, times and places
3. Pick out details about the person (likes, limits, notes)
4. Mark anything it is unsure about
5. Keep the screenshots on this phone only

On success: Show what was found
On error: Show what could not be read

## Save meet-up

Function fn_savemeet. Trigger: Save or Save to roster. Inputs: none. Preconditions: none. Permissions: any. Data: write Meet-up. Output: none. Errors: Something went wrong.

Steps:
1. Check the time is free
2. Block prep time before it (only visible to me)
3. Save the meet-up
4. Ask the partner to confirm if they have a link

On success: All set
On error: Something went wrong

## Find the next free slot

Function fn_nextslot. Trigger: ?. Inputs: none. Preconditions: none. Permissions: any. Data: read Free time. Output: none. Errors: not defined.

Steps:
1. Look at my free times
2. Add my prep time
3. Suggest the next slot that fits

On success: ?
On error: ?

## Cancel meet-up

Function fn_cancel. Trigger: ?. Inputs: none. Preconditions: none. Permissions: any. Data: write Meet-up. Output: none. Errors: not defined.

Steps:
1. Mark it cancelled
2. Free up the time and the prep block
3. Send a discreet heads-up

On success: ?
On error: ?

## Save free time

Function fn_savefree. Trigger: ?. Inputs: none. Preconditions: none. Permissions: any. Data: write Free time. Output: none. Errors: not defined.

Steps:
1. Save the free time
2. Re-check upcoming meet-ups for clashes

On success: ?
On error: ?

## Create share link

Function fn_sharelink. Trigger: ?. Inputs: none. Preconditions: none. Permissions: any. Data: write Share link. Output: none. Errors: not defined.

Steps:
1. Make a private link
2. Show only free or busy times
3. Never show names, meet-ups, totals, profiles, albums or avatars

On success: Copy the link
On error: ?

## Stop sharing

Function fn_stopshare. Trigger: ?. Inputs: none. Preconditions: none. Permissions: any. Data: write Share link. Output: none. Errors: not defined.

Steps:
1. Turn the link off straight away

On success: ?
On error: ?

## Request a time

Function fn_request. Trigger: ?. Inputs: none. Preconditions: none. Permissions: any. Data: none. Output: none. Errors: not defined.

Steps:
1. Send the chosen slot to me
2. Hold it until I confirm

On success: ?
On error: ?

## Set ready status

Function fn_setready. Trigger: I'm good to go or Not today. Inputs: none. Preconditions: none. Permissions: any. Data: write Ready status. Output: none. Errors: not defined.

Steps:
1. Save ready or not ready
2. Set when it runs out
3. Tell me quietly

On success: ?
On error: ?

## Send discreet alert

Function fn_alert. Trigger: ?. Inputs: none. Preconditions: none. Permissions: any. Data: none. Output: none. Errors: not defined.

Steps:
1. Check the discreet alerts setting
2. Send a plain notification like "Plans updated"
3. Never show details on the lock screen

On success: ?
On error: ?

## Build profile

Function fun_flkwc1s8e. Trigger: Save profile after checking. Inputs: none. Preconditions: none. Permissions: any. Data: write Person, write Profile album, write Person feature. Output: none. Errors: Something went wrong.

Steps:
1. Match the screenshots to an existing person or start a new one
2. Turn what was found into notes (broader profile, qualities, details from messages and images)
3. Sort each detail into a category
4. Put every screenshot image into the person's album
5. Save it all on this device only
6. Offer a nickname instead of a name

On success: Profile saved
On error: Something went wrong

## Sort features into categories

Function fun_mzsdlss8e. Trigger: ?. Inputs: none. Preconditions: none. Permissions: any. Data: write Person feature. Output: none. Errors: not defined.

Steps:
1. Read the notes
2. Tag each detail as age, demographic, quality, looks, interests or other
3. Mark anything unsure for me to check

On success: ?
On error: ?

## Suggest a nickname

Function fun_d1v65fs8e. Trigger: ?. Inputs: none. Preconditions: none. Permissions: any. Data: read Person feature, write Person. Output: none. Errors: not defined.

Steps:
1. Look at the qualities saved for this person
2. Suggest a few nicknames based on them
3. I pick one, edit it or keep my own

On success: ?
On error: ?

## Cover private areas

Function fun_oiauuns8e. Trigger: ?. Inputs: none. Preconditions: none. Permissions: any. Data: none. Output: none. Errors: not defined.

Steps:
1. Scan each photo on the phone
2. Add clothing over any bare or private areas
3. Remove faces or details I mark as off limits
4. Show me the covered version to approve

On success: ?
On error: ?

## Make cartoon avatar

Function fun_p1z2gjs8e. Trigger: Make avatar. Inputs: none. Preconditions: none. Permissions: any. Data: write Avatar. Output: none. Errors: Show what went wrong.

Steps:
1. Take the approved covered images or the features I described
2. Use the global cartoon style
3. Keep the person's likeness
4. Return the cartoon and save it to the profile
5. Never change the original photos

On success: Avatar ready
On error: Show what went wrong

## Add custom feature

Function fun_wy5wifs8e. Trigger: Ask AI for a feature. Inputs: none. Preconditions: none. Permissions: any. Data: write Feature template, write Avatar. Output: none. Errors: not defined.

Steps:
1. Take my description of the new feature
2. Ask the AI to draw it in the avatar style
3. Show me the result
4. Save it for this person or as a template

On success: ?
On error: ?

## Plan several meet-ups

Function fun_vzg30wisx. Trigger: Suggest a plan. Inputs: none. Preconditions: none. Permissions: any. Data: read Free time, write Meet-up. Output: none. Errors: Something went wrong.

Steps:
1. Look at my free times
2. Fit each meet-up into a free slot
3. Add my prep time before each one (only visible to me)
4. Leave gaps so nothing overlaps
5. Show me the plan to approve before saving

On success: All set
On error: Something went wrong

## Save partner routine

Function fun_7twf5euj0. Trigger: Save routine. Inputs: none. Preconditions: none. Permissions: any. Data: write Partner routine, read Free time. Output: none. Errors: Something went wrong.

Steps:
1. Save the repeating times
2. Add my prep time before each one (only visible to me)
3. Check for clashes with meet-ups and free times
4. Ask the partner to confirm if they have a link

On success: All set
On error: Something went wrong

## Remind me to start prep

Function fun_kri6r0mn2. Trigger: Prep start time reached. Inputs: none. Preconditions: none. Permissions: any. Data: read Meet-up, read Partner routine. Output: none. Errors: Something went wrong.

Steps:
1. Look at upcoming meet-ups and partner routine times
2. Work out when prep needs to start using the prep time
3. Send a plain reminder such as 'Time to get ready'
4. Skip it if the meet-up was cancelled

On success: Reminder sent
On error: Something went wrong

