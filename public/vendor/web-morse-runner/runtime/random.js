import { DEFAULT } from "./defaults.js"

export const RndNormal = () => {
  return Math.sqrt(-2 * Math.log(Math.random())) * Math.cos(Math.PI * 2 * Math.random())
}

export const RndGaussLim = (AMean, ALim) => {
  let result = AMean + RndNormal() * 0.5 * ALim
  result = Math.max(AMean - ALim, Math.min(AMean + ALim, result))
  return result
}

export const RndUShaped = () => {
  return Math.sin(Math.PI * (Math.random() - 0.5))
}

export const SecondsToBlocks = (Sec) => {
  return Math.round(DEFAULT.RATE / DEFAULT.BUFSIZE * Sec)
}

export const BlocksToSeconds = (Blocks) => {
  return Blocks * DEFAULT.BUFSIZE / DEFAULT.RATE
}

export const RndRayleigh = (AMean) => {
  return AMean * Math.sqrt(-Math.log(Math.random()) - Math.log(Math.random()))
}

export const RndIntInclusive = (min, max) => {
  const minCeiled = Math.ceil(min)
  const maxFloored = Math.floor(max)
  return Math.floor(Math.random() * (maxFloored - minCeiled + 1) + minCeiled) // The maximum is inclusive and the minimum is inclusive
}

export const RndUniform = () => {
    return 2 * Math.random() - 1
}

export const RndPoisson = (AMean) => {
  let g = Math.exp(-AMean)
  let result
  let t = 1
  for (result = 0; result <= 30; result++) {
    t *= Math.random()
    if (t <= g) break
  }
  return result
}


// maximum is exclusive and the minimum is inclusive
export const RandomInt = (min, max) => {
  const minCeiled = Math.ceil(min)
  const maxFloored = Math.floor(max)
  return Math.floor(Math.random() * (maxFloored - minCeiled) + minCeiled)
}