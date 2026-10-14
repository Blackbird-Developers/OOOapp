# Earn leave gradually

How annual leave works in Whooo when a leave policy template has **Earn leave gradually** switched on.

## The idea

Normally everyone on a template gets the whole year's annual leave (for example 20 days) on 1 January.

With **Earn leave gradually** on, those days are earned bit by bit through the year instead. Employees can only book the days they have **already earned**. Any annual leave they've already taken or booked this year comes off what they've earned.

## Turning it on

1. Go to **Leave policies** and open a template.
2. Under **Annual leave**, tick **Earn leave gradually**.
3. Choose how days are earned (**Earned by**), fill in the rate, and press **Save template**.

The change applies straight away to everyone on that template. Turning it off gives them the full year's days again at once. Nothing is lost.

A hint under the settings says what the rate works out to, for example *"That's 1 day about every 2½ weeks (every 13 working days at 40 hours a week), so about 20 days over a full year."* The **Spread N days evenly over the year** link fills in the rate that earns exactly the template's days a year.

## The three ways to earn

### 1. Hours worked

People earn a set number of days for every so many hours they work. For example, **1 day per 104 hours**.

- Hours come from each person's **Hours a week**, set under **Employees → Edit**. If it's left empty, it's 40.
- Each weekday (Monday to Friday) counts as a fifth of their weekly hours: 8 hours for a 40-hour week, 4 hours for a 20-hour week.
- Days of approved **unpaid leave** don't count as hours worked, so they earn nothing.

| Hours a week | 1 day per 104 hours means |
|---|---|
| 40 | 1 day every 13 working days (about every 2½ weeks), about 20 days a year |
| 20 | 1 day every 26 working days (about every 5 weeks), about 10 days a year |

### 2. Pay periods completed

People earn a set number of days each time a pay period is completed, like a line on a payslip.

| Pay periods | Periods a year | To earn 20 days a year |
|---|---|---|
| Weekly | 52 | 0.38 days per period |
| Every two weeks | 26 | 0.77 days per period |
| Twice a month (ending on the 15th and the last day of the month) | 24 | 0.83 days per period |
| Monthly (ending on the last day of the month) | 12 | 1.67 days per period |

Weekly and every-two-weeks periods are counted from 1 January, or from the person's start date if they joined this year.

### 3. Years of service

People earn at a yearly rate that grows the longer they've worked. The rate comes from a scale you set, for example:

| Years of service | Days a year |
|---|---|
| 0 or more | 20 |
| 5 or more | 25 |

- Each completed month earns **one twelfth** of the person's yearly figure.
- Years of service include **previous work experience** entered under **Employees → Edit**, the same as the seniority bonus. With a start date, time at the company counts too.
- The scale already rewards experience, so the **seniority bonus is not added** on top.

## Rules that apply to all three

- **When earning starts:** 1 January, or the person's **start date** if they joined this year. Before their start date they earn nothing.
- **Up to today:** days are earned up to today's date, so the balance grows a little every day or pay period.
- **Booking ahead:** leave later in the year is checked against what's earned **today**. Someone who has earned 15 days can't book 18 days in December yet. They can once they've earned them.
- **The yearly limit:** no one earns more than a limit in one year.
  - **Hours worked** and **pay periods:** the template's **days a year**, plus any **seniority** days. The "Days a year" field is labelled **Most days earned a year** while this is on.
  - **Years of service:** the person's figure on the scale.
- **First-year leave** is ignored while this is on, because earning already starts on the start date.
- **Carry-over** still works. At the end of the year, whatever earned leave is left can carry over under the template's carry-over rules.
- Only **annual leave** is earned gradually. Sick leave and every other leave type work as before.

## Examples

All of these are for a template with 20 days a year, on **13 October 2026**, for someone who has taken no annual leave yet this year.

| Setup | Earned so far |
|---|---|
| 1 day per 104 hours, 40 hours a week, worked here all year | 15.7 days |
| Same, but 20 hours a week | 7.8 days |
| Same, but started on 1 July 2026 (40 hours a week) | 5.8 days |
| Same, with 5 days of approved unpaid leave in March | 15.3 days |
| 1 day per 40 hours (more than 20 a year), no seniority | 20 days (the limit) |
| Same, with seniority on (1 day per 5 years) and 15 years' experience | 23 days (the limit rises to 20 + 3) |
| 0.77 days every two weeks | 15.4 days |
| 1.67 days a month | 15 days |
| 1.67 days a month, started on 1 July 2026 | 5 days |
| Years of service, 0 years' experience (20 a year) | 15 days (9 months × 20 ÷ 12) |
| Years of service, 5 years' experience (25 a year) | 18.8 days (9 months × 25 ÷ 12) |

## What employees see

- The **Annual** figure on **Request leave** and **My requests** shows what they've earned and have left. Clicking it explains how it was worked out, for example *"15.4 days earned so far, of up to 20 this year (0.77 days per fortnightly pay period: 20 pay periods so far)"*.
- If they ask for more days than they have, pressing **Submit request** opens a popup: *"You're taking more days off than you have. Please review your request again."*

## What admins see

- **Leave policies** describes each template's annual leave, for example *"up to 20 working days a year, earned at 0.77 days per fortnightly pay period"*.
- **Employees** shows each person's annual balance with a note such as *"15.4 of 20 earned"*.
- Each person's **Hours a week** is set under **Employees → Edit**, next to their start date and previous experience.
