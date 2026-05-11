import { useCalendar } from "@cc/calendar/contexts/calendar-context";
import { useTranslation } from "react-i18next";

import { AvatarGroup } from "@cc/components/ui/avatar-group";
import { Avatar, AvatarFallback, AvatarImage } from "@cc/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@cc/components/ui/select";

export function UserSelect() {
  const { users, selectedUserId, setSelectedUserId } = useCalendar();
  const { t } = useTranslation();

  return (
    <Select value={selectedUserId} onValueChange={setSelectedUserId}>
      <SelectTrigger className="twcal:flex-1 twcal:md:w-48 twcal:cursor-pointer">
        <SelectValue />
      </SelectTrigger>

      <SelectContent align="end">
        <SelectItem value="all">
          <div className="twcal:flex twcal:items-center twcal:gap-1">
            <AvatarGroup max={2}>
              {users.map(user => (
                <Avatar key={user.id} className="twcal:size-6 twcal:text-xxs">
                  <AvatarImage src={user.picturePath ?? undefined} alt={user.name} />
                  <AvatarFallback className="twcal:text-xxs">{user.name[0]}</AvatarFallback>
                </Avatar>
              ))}
            </AvatarGroup>
            {t("navigation.allUsers")}
          </div>
        </SelectItem>

        {users.map(user => (
          <SelectItem key={user.id} value={user.id} className="twcal:flex-1">
            <div className="twcal:flex twcal:items-center twcal:gap-2">
              <Avatar key={user.id} className="twcal:size-6">
                <AvatarImage src={user.picturePath ?? undefined} alt={user.name} />
                <AvatarFallback className="twcal:text-xxs">{user.name[0]}</AvatarFallback>
              </Avatar>

              <p className="twcal:truncate">{user.name}</p>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
