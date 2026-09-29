import { DEFAULT } from "./defaults.js"
import * as random from "./random.js"
import { QuickAvg } from "./quickavg.js"

export class Qsb {
    constructor() {
        this.Filter = new QuickAvg()
        this.Filter.passes = 3
        this.QsbLevel = 1
        this.Bandwidth = 0.1
        this.FGain = 1
    }

    NewGain() {
        let c = this.Filter.Filter(random.RndUniform(), random.RndUniform())
        let result = Math.sqrt((c.Re*c.Re + c.Im*c.Im) * 3 * this.Filter.points)
        result = result * this.QsbLevel + (1 - this.QsbLevel)
        return result
    }

    set Bandwidth(bw) {
        this.FBandwidth = bw
        this.Filter.points = Math.ceil(
            0.37 * DEFAULT.RATE / Math.floor((DEFAULT.BUFSIZE / 4) * bw),
        )
        for (let i = 0; i <= this.Filter.points * 3; i++) this.FGain = this.NewGain()
    }

    ApplyTo(Arr) {
        const size = Math.floor(DEFAULT.BUFSIZE / 4);
        let BlkCnt = Math.floor(Arr.length / size )

        for (let b = 0; b < BlkCnt; b++) {
            const new_gain = this.NewGain()
            let dG = (new_gain - this.FGain) / size
            for (let i = 0; i < size; i++) {
                Arr[b * size + i] *= this.FGain
                this.FGain += dG
            }
        }
    }
}
