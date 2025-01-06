import { formatInTimeZone } from "date-fns-tz";

const timeZone = "America/La_Paz";
export const formatDateWithDateFns = (date) => {
    const formattedDate = formatInTimeZone(date, timeZone, 'yyyy-MM-dd')
    return formattedDate;
}