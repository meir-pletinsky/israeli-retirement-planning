/** Path of the bundled sample report, relative to the app's base URL (`public/sample/`). */
export const SAMPLE_REPORT_PATH = "sample/sample-clearing-house-report.zip";

export const SAMPLE_REPORT_FILE_NAME = "sample-clearing-house-report.zip";

/**
 * The date the sample report was made up. It is read as of this date so that its age and its
 * "report is old" check do not drift as the real date moves on.
 */
export const SAMPLE_REPORT_DATE = new Date(2026, 9, 30);
