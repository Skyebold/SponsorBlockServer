BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS "sponsorDescriptions" (
	"videoID"	TEXT KEY NOT NULL,
	"firstCharacters"	TEXT NOT NULL,
	"lastCharacters"	    TEXT NOT NULL,
	"length"	INTEGER NOT NULL,
	"descriptionHash"	TEXT NOT NULL,
	"votes"	INTEGER NOT NULL,
	"locked" INTEGER NOT NULL DEFAULT 0,
	"incorrectVotes" INTEGER NOT NULL default 1,
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
	"userAgent" TEXT NOT NULL DEFAULT ''
);

UPDATE "config" SET value = 27 WHERE key = 'version';

COMMIT;