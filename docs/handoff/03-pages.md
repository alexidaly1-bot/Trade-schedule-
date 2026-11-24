# Pages

## Home

- Type: Home / dashboard
- Module: Home
- Who can see it: Me (owner)
- Status: In progress

Only I see this. Shows today's plans and prep at a glance.

| Part | Type | Leads to |
|---|---|---|
| Today's roster | Section | Meet-up |
| Add from screenshots | Button | Add from screenshots |
| Roster | Tab | Roster |
| People | Tab | People |
| Partner ready check | List item | Is my partner good to go? |
| My availability | Tab | My availability |
| Share my availability | Button | Share my availability |
| Settings | Button | Settings |
| Partner routine | Button | Partner routine |

## Add from screenshots

- Type: Form
- Module: Screenshot import
- Who can see it: Me (owner)
- Status: New



| Part | Type | Leads to |
|---|---|---|
| Pick screenshots | Button | Read screenshots |
| Paste text | Text field | - |
| Read them | Button | Read screenshots |

## Check what was found

- Type: Form
- Module: Screenshot import
- Who can see it: Me (owner)
- Status: New

Nothing is saved until I check it.

| Part | Type | Leads to |
|---|---|---|
| Person | Dropdown | Person |
| Date and time | Text field | - |
| Place | Text field | - |
| Notes about them | Text field | - |
| Save to roster | Button | Save meet-up |
| Discard | Button | Home |
| Save profile | Button | Build profile |

## Roster

- Type: List
- Module: Roster
- Who can see it: Me (owner)
- Status: New



| Part | Type | Leads to |
|---|---|---|
| This week | Section | Meet-up |
| Meet-up | List item | Meet-up |
| New meet-up | Button | Plan a meet-up |
| Plan several | Button | Plan several |

## Plan a meet-up

- Type: Form
- Module: Roster
- Who can see it: Me (owner)
- Status: New

Prep time is only visible to me.

| Part | Type | Leads to |
|---|---|---|
| Who | Dropdown | Person |
| When | Text field | - |
| Where | Text field | - |
| Prep time needed | Text field | - |
| Save | Button | Save meet-up |

## Meet-up

- Type: Detail
- Module: Roster
- Who can see it: Me (owner)
- Status: New



| Part | Type | Leads to |
|---|---|---|
| Time and place | Section | - |
| Prep plan (only me) | Section | Meet-up |
| Partner ready? | Section | Ready status |
| Reschedule | Button | Find the next free slot |
| Cancel | Button | Cancel meet-up |

## People

- Type: List
- Module: People
- Who can see it: Me (owner)
- Status: New

Private list. Never shared, never counted anywhere others can see.

| Part | Type | Leads to |
|---|---|---|
| Person | List item | Person |
| Add person | Button | Person |
| Insights | Button | Insights |

## Person

- Type: Profile
- Module: People
- Who can see it: Me (owner)
- Status: New



| Part | Type | Leads to |
|---|---|---|
| Nickname | Text field | - |
| Relationship | Dropdown | - |
| What I know about them | Text field | - |
| Usual prep time | Text field | - |
| Plan a meet-up | Button | Plan a meet-up |
| Send them a link | Button | Create share link |
| Photo album | Button | Photo album |
| Avatar | Button | Avatar maker |
| Suggest a nickname | Button | Suggest a nickname |
| Features by category | Section | - |

## I'm good to go

- Type: Custom
- Module: Ready check
- Who can see it: Partner
- Status: New

What my partner sees. One tap replaces the prep talk.

| Part | Type | Leads to |
|---|---|---|
| I'm good to go | Toggle switch | Set ready status |
| Ready for how long? | Dropdown | - |
| Not today | Button | Set ready status |

## Ready!

- Type: Confirmation
- Module: Ready check
- Who can see it: Me (owner)
- Status: New



| Part | Type | Leads to |
|---|---|---|
| Open roster | Button | Roster |

## My availability

- Type: List
- Module: Availability & sharing
- Who can see it: Me (owner)
- Status: New



| Part | Type | Leads to |
|---|---|---|
| Free times | Section | Free time |
| Add free time | Button | Save free time |
| Default prep time | Text field | Default prep time |
| Share my availability | Button | Share my availability |

## Share my availability

- Type: Settings
- Module: Availability & sharing
- Who can see it: Me (owner)
- Status: New

Shared links show free or busy only.

| Part | Type | Leads to |
|---|---|---|
| Who can see it | Dropdown | - |
| Create link | Button | Create share link |
| Stop sharing | Button | Stop sharing |

## Shared availability

- Type: List
- Module: Availability & sharing
- Who can see it: Partner, Shared viewer
- Status: New

What others see: free times only. No names, no meet-ups, no totals.

| Part | Type | Leads to |
|---|---|---|
| Free slot | List item | Request a time |
| Free times | Section | Free time |

## Settings

- Type: Settings
- Module: Settings
- Who can see it: Me (owner)
- Status: New



| Part | Type | Leads to |
|---|---|---|
| App lock | Toggle switch | App lock |
| Discreet alerts | Toggle switch | Discreet alerts |
| Hide private details when sharing | Toggle switch | Hide private details when sharing |
| Health check reminders | Toggle switch | Health check reminders |
| Back to home | Button | Home |
| Appearance | Button | Appearance |

## All set

- Type: Confirmation
- Module: Shared
- Who can see it: Everyone
- Status: New



| Part | Type | Leads to |
|---|---|---|
| Back to roster | Button | Roster |

## Something went wrong

- Type: Error
- Module: Shared
- Who can see it: Everyone
- Status: New



| Part | Type | Leads to |
|---|---|---|
| Try again | Button | Home |

## Photo album

- Type: Media gallery
- Module: People
- Who can see it: Me (owner)
- Status: New

Only visible to me. All screenshot images for this person.

| Part | Type | Leads to |
|---|---|---|
| Images | Section | - |
| Make avatar | Button | Avatar maker |

## Avatar maker

- Type: Custom
- Module: Avatar studio
- Who can see it: Me (owner)
- Status: New

Only visible to me. Draw, describe or let AI simplify covered photos.

| Part | Type | Leads to |
|---|---|---|
| Draw features | Section | - |
| Describe features | Text field | - |
| Use covered photos | Button | Cover private areas |
| Ask AI for a custom feature | Button | Custom feature |
| Save avatar | Button | Avatar |
| Upload photos (permission required) | Button | Cover private areas |

## Custom feature

- Type: Form
- Module: Avatar studio
- Who can see it: Me (owner)
- Status: New

Only visible to me.

| Part | Type | Leads to |
|---|---|---|
| Describe the feature | Text field | - |
| Save for | Dropdown | - |
| Create it | Button | Add custom feature |

## Insights

- Type: List
- Module: People
- Who can see it: Me (owner)
- Status: New

Only visible to me. Shows patterns in the categories I choose. Never shared.

| Part | Type | Leads to |
|---|---|---|
| Pick an attribute | Dropdown | - |
| Results | Section | - |

## Appearance

- Type: Settings
- Module: Settings
- Who can see it: Me (owner)
- Status: New

Only visible to me.

| Part | Type | Leads to |
|---|---|---|
| App theme | Dropdown | App theme |
| Theme previews | Section | - |
| Cartoon avatar style | Dropdown | Cartoon avatar style |

## Plan several

- Type: Form
- Module: Roster
- Who can see it: Me (owner)
- Status: New

Only visible to me. Prep time is never shown to others.

| Part | Type | Leads to |
|---|---|---|
| Who to fit in | Text field | - |
| How many | Text field | - |
| Suggest a plan | Button | Plan several meet-ups |

## Partner routine

- Type: Form
- Module: Ready check
- Who can see it: Me (owner)
- Status: New

Only visible to me. Set repeating times with my partner.

| Part | Type | Leads to |
|---|---|---|
| Days and times | Text field | - |
| Repeats | Dropdown | - |
| Save routine | Button | Save partner routine |

