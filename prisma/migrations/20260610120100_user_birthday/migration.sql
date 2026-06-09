-- Staff birthdays, used to remind super admins a week before the event.
ALTER TABLE "User" ADD COLUMN "birthday" DATE;
CREATE INDEX "User_birthday_idx" ON "User"("birthday");
