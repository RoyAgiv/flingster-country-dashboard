// Representative local clocks per country. IANA zone rules come from the browser's tzdb.
const Featured_Zones = {
  US:[["America/New_York","New York"],["America/Chicago","Chicago"],["America/Denver","Denver"],["America/Los_Angeles","Los Angeles"],["Pacific/Honolulu","Honolulu"]],
  CA:[["America/Toronto","Toronto"],["America/Winnipeg","Winnipeg"],["America/Edmonton","Edmonton"],["America/Vancouver","Vancouver"]],
  BR:[["America/Sao_Paulo","São Paulo"],["America/Manaus","Manaus"],["America/Belem","Belém"],["America/Rio_Branco","Rio Branco"]],
  AU:[["Australia/Sydney","Sydney"],["Australia/Adelaide","Adelaide"],["Australia/Brisbane","Brisbane"],["Australia/Perth","Perth"]],
  RU:[["Europe/Moscow","Moscow"],["Asia/Yekaterinburg","Yekaterinburg"],["Asia/Novosibirsk","Novosibirsk"],["Asia/Vladivostok","Vladivostok"]],
  MX:[["America/Mexico_City","Mexico City"],["America/Tijuana","Tijuana"],["America/Cancun","Cancún"]],
  ID:[["Asia/Jakarta","Jakarta"],["Asia/Makassar","Makassar"],["Asia/Jayapura","Jayapura"]],
  NZ:[["Pacific/Auckland","Auckland"],["Pacific/Chatham","Chatham"]],
  ES:[["Europe/Madrid","Madrid"],["Atlantic/Canary","Canary Islands"]],
  PT:[["Europe/Lisbon","Lisbon"],["Atlantic/Azores","Azores"]],
  CL:[["America/Santiago","Santiago"],["America/Punta_Arenas","Punta Arenas"],["Pacific/Easter","Easter Island"]],
  AR:[["America/Argentina/Buenos_Aires","Buenos Aires"],["America/Argentina/Cordoba","Córdoba"]],
  GB:[["Europe/London","London"]],
  IL:[["Asia/Jerusalem","Jerusalem"]],
  IN:[["Asia/Kolkata","India"]],
  JP:[["Asia/Tokyo","Tokyo"]],
  CN:[["Asia/Shanghai","Beijing"]],
  TR:[["Europe/Istanbul","Istanbul"]],
  DE:[["Europe/Berlin","Berlin"]],
  FR:[["Europe/Paris","Paris"]],
  IT:[["Europe/Rome","Rome"]],
  ZA:[["Africa/Johannesburg","Johannesburg"]],
  AE:[["Asia/Dubai","Dubai"]],
  PH:[["Asia/Manila","Manila"]],
  CO:[["America/Bogota","Bogotá"]],
  EG:[["Africa/Cairo","Cairo"]],
  KR:[["Asia/Seoul","Seoul"]],
  PK:[["Asia/Karachi","Karachi"]],
  BD:[["Asia/Dhaka","Dhaka"]],
  NG:[["Africa/Lagos","Lagos"]],
};
const Country_Zone_Cache = new Map();

export function Get_Country_Time_Zones(Country_Code) {
  if (typeof Country_Code !== "string" || !/^[A-Z]{2}$/.test(Country_Code)) return [];
  if (Country_Zone_Cache.has(Country_Code)) return Country_Zone_Cache.get(Country_Code);
  let Zones = Featured_Zones[Country_Code] || [];
  if (!Zones.length) {
    try {
      const Locale = new Intl.Locale("und-" + Country_Code);
      const Values = typeof Locale.getTimeZones === "function" ? Locale.getTimeZones() : [];
      Zones = (Values || []).slice(0,4).map((Zone) => [
        Zone, Zone.split("/").at(-1).replaceAll("_"," "),
      ]);
    } catch (Error_Object) { Zones = []; }
  }
  const Valid = [];
  const Seen = new Set();
  for (const [Zone, City] of Zones) {
    try {
      new Intl.DateTimeFormat("en-US",{timeZone:Zone}).format(new Date());
      const Canonical = new Intl.DateTimeFormat("en-US",{timeZone:Zone}).resolvedOptions().timeZone;
      if (!Seen.has(Canonical)) {
        Seen.add(Canonical);
        Valid.push({ Zone:Canonical, City });
      }
    } catch (Error_Object) { /* Ignore obsolete IANA names. */ }
  }
  Country_Zone_Cache.set(Country_Code,Valid);
  return Valid;
}

export function Format_Country_Clock(Timestamp_Ms, Zone) {
  if (!Number.isFinite(Timestamp_Ms) || !Zone) return null;
  try {
    const Date_Object = new Date(Timestamp_Ms);
    return {
      Time:new Intl.DateTimeFormat("en-US",{timeZone:Zone,hour:"numeric",minute:"2-digit",hour12:true}).format(Date_Object),
      Day:new Intl.DateTimeFormat("en-US",{timeZone:Zone,weekday:"short",month:"short",day:"numeric"}).format(Date_Object),
      Zone,
    };
  } catch (Error_Object) { return null; }
}

export function Get_Country_Local_Hour(Timestamp_Seconds, Zone) {
  if (!Number.isSafeInteger(Timestamp_Seconds) || !Zone) return null;
  try {
    const Parts = new Intl.DateTimeFormat("en-US",{
      timeZone:Zone,hour:"2-digit",hourCycle:"h23",
    }).formatToParts(new Date(Timestamp_Seconds*1000));
    return Number(Parts.find((Part)=>Part.type==="hour")?.value);
  } catch (Error_Object) { return null; }
}
