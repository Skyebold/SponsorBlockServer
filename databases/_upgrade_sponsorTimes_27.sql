BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS "sponsorDescriptions" (
	`descriptionID`	INTEGER PRIMARY KEY AUTOINCREMENT,
	"videoID"	TEXT NOT NULL,
	`channelID`	TEXT NOT NULL,
	"firstCharacters"	TEXT NOT NULL,
	"lastCharacters"	    TEXT NOT NULL,
	"length"	INTEGER NOT NULL,
	"descriptionHash"	TEXT NOT NULL,
	"locked" INTEGER NOT NULL DEFAULT 0,
	"UUID"	TEXT NOT NULL UNIQUE,
	"userID"	TEXT NOT NULL,
	"timeSubmitted"	INTEGER NOT NULL,
	"views"	INTEGER NOT NULL,
	"category"	TEXT NOT NULL DEFAULT 'sponsor',
	"service" TEXT NOT NULL DEFAULT 'YouTube',
	"hidden" INTEGER NOT NULL DEFAULT 0,
	"reputation" REAL NOT NULL DEFAULT 0,
	"shadowHidden"	INTEGER NOT NULL,
	"hashedVideoID" TEXT NOT NULL DEFAULT '',
	"userAgent" TEXT NOT NULL DEFAULT '',
	`videoOnly`	INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE `sponsorDescriptionsPerVideoVotes` (
	`descriptionID`	INTEGER NOT NULL,
	`videoID`	TEXT NOT NULL,
	`channelID`	TEXT NOT NULL,
	`votes`	INTEGER,
	`incorrectVotes`	INTEGER
);

CREATE INDEX `sponsorDescriptionsPerVideoVotes_index` ON `sponsorDescriptionsPerVideoVotes` (
	`channelID`,
	`videoID`
);

CREATE INDEX `sponsorDescriptions_index` ON `sponsorDescriptions` (
	`channelID`,
	`videoID`
);

UPDATE "config" SET value = 27 WHERE key = 'version';

COMMIT;