CREATE TABLE `session_memory` (
	`id` text PRIMARY KEY,
	`project_id` text NOT NULL,
	`session_id` text,
	`message_id` text,
	`type` text NOT NULL,
	`source` text NOT NULL,
	`title` text,
	`content` text NOT NULL,
	`keywords` text NOT NULL,
	`weight` integer NOT NULL,
	`time_accessed` integer,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	CONSTRAINT `fk_session_memory_project_id_project_id_fk` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_session_memory_session_id_session_id_fk` FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_session_memory_message_id_message_id_fk` FOREIGN KEY (`message_id`) REFERENCES `message`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX `session_memory_project_idx` ON `session_memory` (`project_id`);
--> statement-breakpoint
CREATE INDEX `session_memory_project_type_idx` ON `session_memory` (`project_id`,`type`);
--> statement-breakpoint
CREATE INDEX `session_memory_session_idx` ON `session_memory` (`session_id`);
--> statement-breakpoint
CREATE INDEX `session_memory_updated_idx` ON `session_memory` (`project_id`,`time_updated`);
