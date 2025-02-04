import { formatInTimeZone } from "date-fns-tz";

const timeZone = "America/La_Paz";

export const formatDateWithDateFns = (date) => {
    const dateObject = date instanceof Date ? date : new Date(date); // Convertir si es necesario
    return formatInTimeZone(dateObject, timeZone, "yyyy-MM-dd");
};

export const formatDateWithDateFnsWithTime = (date) => {
    const dateObject = date instanceof Date ? date : new Date(date); // Convertir si es necesario
    return formatInTimeZone(dateObject, timeZone, "yyyy-MM-dd HH:mm:ss");
};
