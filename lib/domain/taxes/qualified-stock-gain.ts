/** General preferential-rate gain from the two net amounts on Schedule D. */
export function qualifiedScheduleDGain(netLongTermGain: bigint, netCapitalGain: bigint): bigint {
  const smallerGain = netLongTermGain < netCapitalGain ? netLongTermGain : netCapitalGain
  return smallerGain > 0n ? smallerGain : 0n
}
