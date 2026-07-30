# Timestamp Formatter Specification

## Purpose

Convert Instagram's Unix-epoch timestamps into human-readable strings for filenames, caption export metadata, and summary display. The system MUST surface publication timestamps so users can identify when posts were published without checking Instagram.

## Requirements

### Requirement: formatTs helper

The system SHALL provide a `formatTs(ts, formatType)` pure function that converts Unix seconds to a formatted UTC datetime string. When `formatType='file'` the separator SHALL be hyphens/underscores (`YYYY-MM-DD_HH-mm-SS`); when `formatType='display'` the separator SHALL be spaces/colons (`YYYY-MM-DD HH:mm:ss`). The function MUST return empty string for falsy, zero, or negative input.

#### Scenario: Valid timestamp produces file format

- GIVEN a post with `taken_at=1735129800`
- WHEN `formatTs(1735129800, 'file')` is called
- THEN the result SHALL be `"2024-12-25_14-30-00"`

#### Scenario: Valid timestamp produces display format

- GIVEN a post with `taken_at=1735129800`
- WHEN `formatTs(1735129800, 'display')` is called
- THEN the result SHALL be `"2024-12-25 14:30:00"`

#### Scenario: Missing timestamp returns empty string

- GIVEN a post with `taken_at=0` or falsy timestamp
- WHEN `formatTs(ts, 'file')` or `formatTs(ts, 'display')` is called
- THEN the result SHALL be `""`

### Requirement: Timestamped filenames

Downloaded media filenames MUST include the formatted publication timestamp as a prefix when available. The filename pattern SHALL be `YYYY-MM-DD_HH-mm-SS_media_N.jpg` for timestamped posts and `media_N.jpg` when no timestamp exists. This MUST apply to both standalone and carousel media items.

#### Scenario: Standalone post with timestamp

- GIVEN a post with `taken_at=1735129800` and 1 media item
- WHEN media is downloaded
- THEN the filename SHALL be `2024-12-25_14-30-00_media_1.jpg`

#### Scenario: Post without timestamp

- GIVEN a post with `taken_at=0` and 1 media item
- WHEN media is downloaded
- THEN the filename SHALL be `media_1.jpg`

#### Scenario: Carousel items with timestamp

- GIVEN a post with `taken_at=1735129800` and 3 carousel items
- WHEN media is downloaded
- THEN filenames SHALL be `2024-12-25_14-30-00_media_1.jpg`, `...media_2.jpg`, `...media_3.jpg`

### Requirement: Caption taken_at field

Caption JSON export MUST include a `taken_at` field with the post's publication datetime in display format, or empty string when no timestamp is available. The `captions.json` entry shape SHALL be `{ code, text, taken_at }`.

#### Scenario: Caption with timestamp

- GIVEN a post with code `ABC123` and `taken_at=1735129800`
- WHEN captions are exported
- THEN the entry SHALL include `"taken_at": "2024-12-25 14:30:00"`

#### Scenario: Caption without timestamp

- GIVEN a post with `taken_at=0`
- WHEN captions are exported
- THEN the entry SHALL include `"taken_at": ""`

### Requirement: Summary oldest and newest dates

The extraction summary MUST include the oldest and newest post dates computed from all downloaded posts. If no posts have timestamps, the values SHALL be `"—"`.

#### Scenario: Summary with timestamped posts

- GIVEN posts with timestamps ranging from 1735129800 to 1736000000
- WHEN extraction completes and summary is generated
- THEN summary SHALL show `oldestPost` as `"2024-12-25 14:30:00"` and `newestPost` as a later date string

#### Scenario: Summary with no timestamps

- GIVEN posts where all `taken_at` values are 0
- WHEN extraction completes and summary is generated
- THEN `oldestPost` and `newestPost` SHALL be `"—"`

### Requirement: i18n summary date labels

The system SHALL provide localised labels for summary date rows via two new keys: `summaryOldest` and `summaryNewest`.

#### Scenario: English labels resolve correctly

- GIVEN locale is set to `en`
- WHEN `i18n.t('summaryOldest')` and `i18n.t('summaryNewest')` are resolved
- THEN results SHALL be `"Oldest post"` and `"Newest post"` respectively

#### Scenario: Spanish labels resolve correctly

- GIVEN locale is set to `es`
- WHEN `i18n.t('summaryOldest')` and `i18n.t('summaryNewest')` are resolved
- THEN results SHALL be `"Post más antiguo"` and `"Post más reciente"` respectively

## Acceptance Criteria

- [ ] `formatTs(1735129800, 'file')` → `"2024-12-25_14-30-00"`
- [ ] `formatTs(0, 'file')` → `""`
- [ ] Filename: `2024-12-25_14-30-00_media_1.jpg` (ts present) or `media_1.jpg` (ts=0)
- [ ] `captions.json`: each entry has `"taken_at": "2024-12-25 14:30:00"` or `""`
- [ ] Summary table shows oldest/newest dates or `"—"`
- [ ] i18n keys resolve in both EN and ES locales
