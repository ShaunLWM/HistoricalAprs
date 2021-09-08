import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import weekOfYear from "dayjs/plugin/weekOfYear";
import { request, gql } from "graphql-request";

dayjs.extend(utc);
dayjs.extend(weekOfYear);
const ONE_DAY_UNIX = 24 * 60 * 60;
const STREAMING_FAST_ENDPOINT = "https://bsc.streamingfast.io/subgraphs/name/pancakeswap/exchange-v2";

/**
 * Data for drawing Volume and TVL charts on pool page
 */
const POOL_CHART = gql`
  query pairDayDatas($startTime: Int!, $skip: Int!, $address: Bytes!) {
    pairDayDatas(
      first: 1000
      skip: $skip
      where: { pairAddress: $address, date_gt: $startTime }
      orderBy: date
      orderDirection: asc
    ) {
      date
      dailyVolumeUSD
      reserveUSD
    }
  }
`;

interface ChartResults {
  pairDayDatas: {
    date: number;
    dailyVolumeUSD: string;
    reserveUSD: string;
  }[];
}

export type PoolChartEntry = {
  date: number;
  volumeUSD: number;
  totalValueLockedUSD: number;
};

export default async function fetchPoolChartData(address: string) {
  let data: {
    date: number;
    volumeUSD: string;
    tvlUSD: string;
  }[] = [];
  const startTimestamp = 1619170975;
  const endTimestamp = dayjs.utc().unix();

  let error = false;
  let skip = 0;
  let allFound = false;

  try {
    while (!allFound) {
      const { pairDayDatas } = await request<ChartResults>(STREAMING_FAST_ENDPOINT, POOL_CHART, {
        address,
        startTime: startTimestamp,
        skip,
      });

      skip += 1000;
      if (pairDayDatas.length < 1000) {
        allFound = true;
      }

      if (pairDayDatas) {
        const fmt = pairDayDatas.map((e) => ({
          date: e.date,
          volumeUSD: e.dailyVolumeUSD,
          tvlUSD: e.reserveUSD,
        }));
        data = data.concat(fmt);
      }
    }
  } catch {
    error = true;
  }

  if (data) {
    const formattedExisting = data.reduce((accum: { [date: number]: PoolChartEntry }, dayData) => {
      const roundedDate = parseInt((dayData.date / ONE_DAY_UNIX).toFixed(0));
      // TODO PCS: { [roundedDate]: {...}, ...accum }
      // eslint-disable-next-line no-param-reassign
      accum[roundedDate] = {
        date: dayData.date,
        volumeUSD: parseFloat(dayData.volumeUSD),
        totalValueLockedUSD: parseFloat(dayData.tvlUSD),
      };
      return accum;
    }, {});

    const firstEntry = formattedExisting[parseInt(Object.keys(formattedExisting)[0])];

    // fill in empty days ( there will be no day datas if no trades made that day )
    let timestamp = firstEntry?.date ?? startTimestamp;
    let latestTvl = firstEntry?.totalValueLockedUSD ?? 0;
    while (timestamp < endTimestamp - ONE_DAY_UNIX) {
      const nextDay = timestamp + ONE_DAY_UNIX;
      const currentDayIndex = parseInt((nextDay / ONE_DAY_UNIX).toFixed(0));
      if (!Object.keys(formattedExisting).includes(currentDayIndex.toString())) {
        formattedExisting[currentDayIndex] = {
          date: nextDay,
          volumeUSD: 0,
          totalValueLockedUSD: latestTvl,
        };
      } else {
        latestTvl = formattedExisting[currentDayIndex].totalValueLockedUSD;
      }
      timestamp = nextDay;
    }

    const dateMap = Object.keys(formattedExisting).map((key) => {
      return formattedExisting[parseInt(key)];
    });

    return {
      data: dateMap,
      error: false,
    };
  }
  return {
    data: undefined,
    error,
  };
}

(async () => {
  const results = await fetchPoolChartData("0x58f876857a02d6762e0101bb5c46a8c1ed44dc16");
  console.log(JSON.stringify(results, null, 2));
  console.log(results.data.length);

  for (const p of results.data) {
    const cakeAutoVaultWithApr = { ...cakeAutoVault, apr: getAprData(cakeAutoVault, performanceFeeAsDecimal).apr };
  }
})();
