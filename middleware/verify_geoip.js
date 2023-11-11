export default
(geoIP, isPrivateIP) =>
    async (_, res) => {
    const allow = res.local.goodCountries;
    const deny = res.local.badCountries;

    if ((allow.length || deny.length)) {
        if (isPrivateIP(res.local.remoteIP)) {
            res.local.logger.queue('Private IP, skips country check.');
            return;
        }

        let countryCode = null;

        if (res.local.useGeoIpCountryIsApi) {
            res.local.logger.queue(`Using Country Is API`);
            countryCode = await getCountryCodeFromCountryIsApi(res);
        }

        if (countryCode === null) {
            const geoLocation = geoIP.get(res.local.remoteIP);
            countryCode = geoLocation?.country?.iso_code;
        }

        if (countryCode) {
            res.local.logger.addPrefix(countryCode);
            res.local.ipCountryCode = countryCode;

            if (allow.length) {
                if (allow.indexOf(countryCode) != -1) {
                    res.local.logger.queue(`IP matched allowed country ${countryCode}.`);
                    return;
                }
                res.statusCode = 403;
                res.local.logger.flush('No allowed country matched. Rejected.');
                return res.end();
            }

            if (deny.length) {
                if (deny.indexOf(countryCode) != -1) {
                    res.statusCode = 403;
                    res.local.logger.flush(`IP matched denied country ${countryCode}. Rejected.`);
                    return res.end();
                }
            }
        }
    }
};

async function getCountryCodeFromCountryIsApi(res) {
    if (res.local.ipApiCacheStore.has(res.local.remoteIP)) {
        res.local.logger.flush(`re using cached API`);
        return res.local.ipApiCacheStore.get(res.local.remoteIP);
    }
    else {
        const response = await fetch(`https://api.country.is/${res.local.remoteIP}`);
        if (!response.ok) {
            res.local.logger.flush(`country.is IP API lookup failed for ${res.local.remoteIP}`);
            return null;
          }
        const apiData = await response.json();
        const countryCode = apiData?.country?.toUpperCase();
        if (countryCode) {
            res.local.logger.flush(`Setting ${countryCode} to store`);
            res.local.ipApiCacheStore.set(res.local.remoteIP, countryCode);
        }
        return countryCode;
    }
}
