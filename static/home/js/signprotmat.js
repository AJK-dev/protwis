// * CONSTANTS
var margin = { top: 60, right: 200, bottom: 180, left: 200 };
var w = 1200 - margin.left - margin.right, h = 1000 - margin.top - margin.bottom;
// change to 600 for more compact view
var non_int_col = "#fff";
// array for data in infobox
var info_data = [];
var signprotmat = {
    // * DATA TRANSFORMATION FUNCTIONS
    data: {
        extractPdbIDs: function (dataset) {
            var ret = [];
            Object.keys(dataset).forEach(function (e) { return ret.push(e.toUpperCase()); });
            return ret;
        },
        objectToArray: function (dataset) {
            return Object.keys(dataset).map(function (key) { return dataset[key]; });
        },
        moveKeyToArray: function (dataset, pdb_ids) {
            for (var i = 0; i < pdb_ids.length; i++) {
                var pdb = pdb_ids[i];
                for (var j = 0; j < dataset[i].length; j++) {
                    dataset[i][j].push(pdb);
                }
            }
            return dataset;
        },
        // https://stackoverflow.com/questions/10865025/merge-flatten-an-array-of-arrays-in-javascript/25804569#comment50580016_10865042
        flattenOnce: function (array) {
            return [].concat.apply([], array);
        },
        labelData: function (data, keys) {
            var data_labeled = data.map(function (e) {
                var obj = {};
                keys.forEach(function (key, i) {
                    obj[key] = e[i];
                });
                return obj;
            });
            return data_labeled;
        },
        getInteractionTypes: function (dataset) {
            var int_ty = [];
            for (var i = 0; i < dataset.length; i++) {
                var int_arr = dataset[i].int_ty;
                int_ty.push(int_arr);
            }
            int_ty = signprotmat.data
                .flattenOnce(int_ty)
                .filter(function (v, i, a) { return a.indexOf(v) === i; });
            var rm_index = int_ty.indexOf("undefined");
            if (rm_index > -1) {
                int_ty.splice(rm_index, 1);
            }
            return int_ty;
        },
        get_additional_receptors: function (data, xvals, prids) {
            var new_receptor_data = [];
            for (var index = 0; index < data.length; index++) {
                var e1 = data[index]["rec_gn"];
                var e2 = data[index]["entry_name"];
                if (xvals.includes(e1) && prids.includes(e2)) {
                    new_receptor_data.push(data[index]);
                }
            }
            return new_receptor_data;
        },
        extractRecSigData: function (data, which_component) {
            if (which_component === "rec") {
                return _.uniqBy(data, function (t) { return [t.rec_gn, t.pdb_id].join(); });
            }
            else if (which_component === "sig") {
                return _.uniqBy(data, function (t) { return [t.sig_gn, t.pdb_id].join(); });
            }
            else {
                console.log("No component specified...");
            }
        },
        select_by_value: function (selection, value) {
            var ret_sel = [];
            for (var index = 0; index < selection.length; index++) {
                ret_sel.push(selection[index][value]);
            }
            return ret_sel;
        },
        removeUndefinedGN: function (dataset) {
            return _.filter(dataset, function (o) {
                return o.rec_gn !== "-";
            });
        },
        dataTransformationWrapper: function (dataset, keys, pdb_sel) {
            // dataset = _.pick(dataset, pdb_sel);
            // let pdb_ids = signprotmat.data.extractPdbIDs(dataset);
            // let data_t = signprotmat.data.objectToArray(dataset);
            // data_t = signprotmat.data.moveKeyToArray(data_t, pdb_ids);
            // data_t = signprotmat.data.flattenOnce(data_t);
            var data_t = signprotmat.data.labelData(dataset, keys);
            data_t = signprotmat.data.removeUndefinedGN(data_t);
            data_t = _.filter(data_t, function (d) { return pdb_sel.includes(d.pdb_id); });
            var data_t_rec = signprotmat.data.extractRecSigData(data_t, "rec");
            var data_t_sig = signprotmat.data.extractRecSigData(data_t, "sig");
            var int_ty = signprotmat.data.getInteractionTypes(data_t);
            var pdb_ids = _.uniqBy(data_t, "pdb_id");
            pdb_ids = _.map(pdb_ids, function (d) { return d.pdb_id; });
            var return_data = {
                transformed: data_t,
                receptor: data_t_rec,
                signprot: data_t_sig,
                inttypes: int_ty,
                pdbids: pdb_ids
            };
            return return_data;
        },
        annotateNonInteractionData: function (meta, data) {
            data.forEach(function (element) {
                var tmp = _.find(meta, function (d) { return d.entry_name === element.entry_name; });
                element["pdb_id"] = tmp.pdb_id;
            });
            return data;
        }
    },
    // * D3 DRAW FUNCTIONS
    d3: {
        // * SETTING UP SVG FOR OUTPUT
        setup: function (div, loc) {
            if (loc === "seqsig") {
                h = 1500;
            }
            else if (loc === "conseq") {
                h = 0;
            }
            else {
                h = 1000 - margin.top - margin.bottom;
            }
            var svg = d3
                .select("body")
                .select("div#content")
                .select(div)
                .append("svg")
                .attr("preserveAspectRatio", "xMinYMin meet")
                .attr("viewBox", "0 0 " +
                (w + margin.left + margin.right) +
                " " +
                (h + 200 + margin.top + margin.bottom))
                // .classed("svg-content", true) //class to make it responsive
                .attr("class", typeof loc !== "undefined" ? "svg-content " + loc : "svg-content")
                .append("g")
                .attr("transform", "translate(" + margin.left + "," + margin.top + ")");
            return svg;
        },
        // * SETTING THE X/Y SCALE
        xScale: function (data) {
            var xScale = d3
                .scaleBand()
                .domain(d3
                .map(data, function (d) { return d.rec_gn; })
                .keys()
                .sort(d3.ascending))
                .range([0, w])
                // .round(true)
                .padding(1);
            return xScale;
        },
        yScale: function (data, gprot) {
            var domain = d3
                .map(data, function (d) { return d.sig_gn; })
                .keys()
                // .sort(d3.descending);
                .sort(function (a, b) {
                var a_patt = /\.(\S*)\./g;
                var b_patt = /\.(\S*)\./g;
                var a_match = a_patt.exec(a);
                var b_match = b_patt.exec(b);
                var a_obj = _.find(gprot, function (d) { return d.slug === a_match[1]; });
                var b_obj = _.find(gprot, function (d) { return d.slug === b_match[1]; });
                // console.log(a_obj.id);
                // console.log(a_obj.id + (+a.slice(-2)/100));
                return d3.descending(a_obj.id + +a.slice(-2) / 100, b_obj.id + +b.slice(-2) / 100);
                // return d3.descending(a_obj.id, b_obj.id);
            });
            var yScale = d3
                .scaleBand()
                .domain(domain)
                .range([h, 0])
                .padding(1);
            return yScale;
        },
        // * SETTING THE PDB/SIG-PROT SCALE
        pdbScale: function (data, meta) {
            var pdbScale = d3
                .scaleBand()
                .domain(d3
                .map(data, function (d) { return d.pdb_id; })
                .keys()
                .sort(function (a, b) {
                var a_obj = _.find(meta, function (d) { return d.pdb_id === a; });
                var b_obj = _.find(meta, function (d) { return d.pdb_id === b; });
                return d3.descending(a_obj.entry_name, b_obj.entry_name);
            }))
                .range([300, 0])
                .padding(1);
            return pdbScale;
        },
        sigScale: function (data, meta) {
            var sigScale = d3
                .scaleBand()
                .domain(d3
                .map(data, function (d) { return d.pdb_id; })
                .keys()
                .sort(function (a, b) {
                var a_obj = _.find(meta, function (d) { return d.pdb_id === a; });
                var b_obj = _.find(meta, function (d) { return d.pdb_id === b; });
                return d3.descending(a_obj.gprot, b_obj.gprot);
            }))
                .range([120, 0])
                .padding(1);
            return sigScale;
        },
        // * SETTING THE COLOR SCALE
        colScale: function (f) {
            var scale = {
                "van-der-waals": "#d9d9d9",
                "edge-to-face": "#969696",
                "water-mediated": "#7DB144",
                hydrophobic: "#93d050",
                "polar-sidechain-sidechain": "#EAA91F",
                "polar-sidechain-backbone": "#C38E1A",
                "polar-backbone-sidechain": "#C3A563",
                "h-bond donor-acceptor": "#7030a0",
                "h-bond acceptor-donor": "#B24DFF",
                "cation-pi": "#0070c0",
                "pi-cation": "#005693",
                ionic: "#00B9BF"
            };
            var colScale = d3
                .scaleOrdinal()
                .domain(Object.keys(scale))
                .range(Object.values(scale));
            return colScale;
        },
        // * seqsig
        // * SETTING THE FEATURE SCALE
        fScale: function (data) {
            var f = _.map(data, function (d) {
                var length_text = d.length != "" ? " (" + d.length + ")" : "";
                return d.feature + length_text;
            });
            var fScale = d3
                .scaleBand()
                .domain(f)
                .range([0, h])
                // .round(true)
                .padding(1);
            return fScale;
        },
        resScaleColor: function (f) {
            var scale = {
                A: { bg_color: "#E6E600", font_color: "#000000" },
                C: { bg_color: "#B2B548", font_color: "#000000" },
                D: { bg_color: "#E60A0A", font_color: "#FDFF7B" },
                E: { bg_color: "#E60A0A", font_color: "#FDFF7B" },
                F: { bg_color: "#18FF0B", font_color: "#000000" },
                G: { bg_color: "#FF00F2", font_color: "#000000" },
                H: { bg_color: "#0093DD", font_color: "#000000" },
                I: { bg_color: "#E6E600", font_color: "#000000" },
                K: { bg_color: "#145AFF", font_color: "#FDFF7B" },
                L: { bg_color: "#E6E600", font_color: "#000000" },
                M: { bg_color: "#E6E600", font_color: "#000000" },
                N: { bg_color: "#A70CC6", font_color: "#FDFF7B" },
                P: { bg_color: "#CC0099", font_color: "#FDFF7B" },
                Q: { bg_color: "#A70CC6", font_color: "#FDFF7B" },
                R: { bg_color: "#145AFF", font_color: "#FDFF7B" },
                S: { bg_color: "#A70CC6", font_color: "#FDFF7B" },
                T: { bg_color: "#A70CC6", font_color: "#FDFF7B" },
                V: { bg_color: "#E6E600", font_color: "#000000" },
                W: { bg_color: "#0BCF00", font_color: "#000000" },
                Y: { bg_color: "#18FF0B", font_color: "#000000" },
                "-": { bg_color: "#FFFFFF", font_color: "#000000" },
                _: { bg_color: "#EDEDED", font_color: "#000000" },
                "+": { bg_color: "#FFFFFF", font_color: "#000000" }
            };
            return scale[f];
        },
        fScaleColor: function (f) {
            if (f === "αH") {
                f = "aH";
            }
            var scale = {
                HY: { bg_color: "#93d050" },
                HA: { bg_color: "#ffff00" },
                M: { bg_color: "#ffff00" },
                A: { bg_color: "#ffff00" },
                I: { bg_color: "#ffff00" },
                L: { bg_color: "#ffff00" },
                V: { bg_color: "#ffff00" },
                HR: { bg_color: "#07b050" },
                W: { bg_color: "#07b050" },
                Y: { bg_color: "#07b050" },
                F: { bg_color: "#07b050" },
                Hb: { bg_color: "#7030a0", font_color: "#ffffff" },
                N: { bg_color: "#7030a0", font_color: "#ffffff" },
                Q: { bg_color: "#7030a0", font_color: "#ffffff" },
                S: { bg_color: "#7030a0", font_color: "#ffffff" },
                T: { bg_color: "#7030a0", font_color: "#ffffff" },
                Hu: { bg_color: "#7030a0", font_color: "#ffffff" },
                Ha: { bg_color: "#7030a0", font_color: "#ff0000" },
                Hd: { bg_color: "#7030a0", font_color: "#02b0f0" },
                "+-": { bg_color: "#0070c0", font_color: "#ff0000" },
                "+": { bg_color: "#0070c0", font_color: "#000000" },
                H: { bg_color: "#0070c0", font_color: "#000000" },
                K: { bg_color: "#0070c0", font_color: "#000000" },
                R: { bg_color: "#0070c0", font_color: "#000000" },
                "-": { bg_color: "#ff0000" },
                D: { bg_color: "#ff0000" },
                E: { bg_color: "#ff0000" },
                Sm: { bg_color: "#ffffff" },
                aH: { bg_color: "#d9d9d9" },
                G: { bg_color: "#ff02ff" },
                P: { bg_color: "#d603ff", font_color: "#ffffff" },
                C: { bg_color: "#bf8f00" }
            };
            return scale[f];
        },
        colorBySwitch: function (which, colScale) {
            if (which === "res") {
                var other = "int";
                var res = d3.select("g#recAA").selectAll("g");
                res.selectAll("rect").style("fill", function (d) {
                    var col = signprotmat.d3.resScaleColor(d.rec_aa);
                    if (typeof col != "undefined") {
                        return col.bg_color;
                    }
                    else {
                        return null;
                    }
                });
                res.selectAll("text").style("fill", function (d) {
                    var col = signprotmat.d3.resScaleColor(d.rec_aa);
                    if (typeof col != "undefined") {
                        if (typeof col.font_color != "undefined") {
                            return col.font_color;
                        }
                        else {
                            return "#000000";
                        }
                    }
                    else {
                        return "#000000";
                    }
                });
                res = d3.select("g#sigAA").selectAll("g");
                res.selectAll("rect").style("fill", function (d) {
                    var col = signprotmat.d3.resScaleColor(d.sig_aa);
                    if (typeof col != "undefined") {
                        return col.bg_color;
                    }
                    else {
                        return null;
                    }
                });
                res.selectAll("text").style("fill", function (d) {
                    var col = signprotmat.d3.resScaleColor(d.sig_aa);
                    if (typeof col != "undefined") {
                        if (typeof col.font_color != "undefined") {
                            return col.font_color;
                        }
                        else {
                            return "#000000";
                        }
                    }
                    else {
                        return "#000000";
                    }
                });
            }
            else if (which === "int") {
                var other = "res";
                var res = d3.select("g#recAA").selectAll("g");
                res.selectAll("rect").style("fill", function (d) {
                    if (typeof d.int_ty != "undefined") {
                        return colScale(d.int_ty[0]);
                    }
                    else {
                        return non_int_col;
                    }
                });
                res.selectAll("text").style("fill", null);
                res = d3.select("g#sigAA").selectAll("g");
                res.selectAll("rect").style("fill", function (d) {
                    if (typeof d.int_ty != "undefined") {
                        return colScale(d.int_ty[0]);
                    }
                    else {
                        return "#ccc";
                    }
                });
                res.selectAll("text").style("fill", null);
            }
            document.querySelector("#" + which + "but").classList.add("active");
            document.querySelector("#" + other + "but").classList.remove("active");
        },
        cScale: function (data) {
            // const values = d3
            //   .map(data, (d: any) => d.cons)
            //   .keys()
            //   .map(Number)
            //   .sort(d3.ascending)
            // const min = values.pop()
            // const max = values[0]
            // conservation is calculated to be between -1 and 10 by python
            var cScale = d3.scaleSequential(d3.interpolateGreys).domain([0, 100]);
            return cScale;
        },
        // * DEFINING AXIS FOR X/Y AND GRID
        xAxis: function (xScale) {
            var xAxis = d3
                .axisBottom(xScale)
                .tickSize(0)
                .tickPadding(8);
            return xAxis;
        },
        yAxis: function (yScale) {
            var yAxis = d3
                .axisRight(yScale)
                .tickSize(0)
                .tickPadding(8);
            return yAxis;
        },
        xAxisGrid: function (xScale, yScale) {
            var xAxisGrid = d3
                .axisTop(xScale)
                .tickSize(h - yScale.step())
                .tickFormat(function (d) { return ""; });
            return xAxisGrid;
        },
        yAxisGrid: function (xScale, yScale) {
            var yAxisGrid = d3
                .axisRight(yScale)
                .tickSize(w - xScale.step())
                .tickFormat(function (d) { return ""; });
            return yAxisGrid;
        },
        // * ADD TOOLTIP FUNCTIONALITY
        tooltip: function (svg) {
            var tip = d3
                .tip()
                .attr("class", "d3-tip")
                .html(function (d) {
                var pair_string = "";
                d.pairs.forEach(function (e) {
                    pair_string +=
                        e.pdb_id +
                            ": " +
                            e.rec_aa +
                            " vs. " +
                            e.sig_aa +
                            "(" +
                            e.int_ty +
                            ")" +
                            "<br>";
                });
                return ("Receptor: " +
                    d.rec_gn +
                    "<br>" +
                    "Signaling Protein: " +
                    d.sig_gn +
                    "<br>" +
                    "PDBs: " +
                    "<br>" +
                    pair_string);
            });
            svg.call(tip);
            return tip;
        },
        // * RENDER DATA
        renderData: function (svg, data, data_non, interactions_metadata, xScale, yScale, xAxis, yAxis, xAxisGrid, yAxisGrid, colScale, pdbScale, sigScale, tip) {
            var shift_left = 7 / 8;
            var shift_top = 1 / 8;
            var scale_size = shift_left - shift_top;
            var offset = 1;
            var each_res;
            var helper = {};
            var result = data.transformed.reduce(function (r, o) {
                var key = o.rec_gn + "-" + o.sig_gn;
                if (!helper[key]) {
                    var tmp = {
                        rec_gn: o.rec_gn,
                        sig_gn: o.sig_gn,
                        pairs: [
                            {
                                pdb_id: o.pdb_id,
                                rec_aa: o.rec_aa,
                                sig_aa: o.sig_aa,
                                int_ty: o.int_ty
                            }
                        ]
                    };
                    helper[key] = tmp;
                    r.push(helper[key]);
                }
                else {
                    helper[key].pairs.push({
                        pdb_id: o.pdb_id,
                        rec_aa: o.rec_aa,
                        sig_aa: o.sig_aa,
                        int_ty: o.int_ty
                    });
                }
                return r;
            }, []);
            var bwScale = d3
                .scaleSequential(d3.interpolateGreys)
                .domain([0, pdbScale.domain().length]);
            svg
                .append("g")
                .attr("id", "interact")
                .selectAll("rects")
                .data(result)
                .enter()
                .append("rect")
                .attr("x", function (d) {
                // return xScale(d.rec_gn) - shift_left * xScale.step() + offset;
                return xScale(d.rec_gn) - xScale.step();
            })
                .attr("y", function (d) {
                // return yScale(d.sig_gn) + shift_top * yScale.step() + offset;
                return yScale(d.sig_gn);
            })
                .attr("rx", function () {
                if (data.transformed.length < 15) {
                    return 5;
                }
                else {
                    return 3;
                }
            })
                .attr("ry", function () {
                if (data.transformed.length < 15) {
                    return 5;
                }
                else {
                    return 3;
                }
            })
                // .attr("width", xScale.step() * scale_size)
                // .attr("height", yScale.step() * scale_size)
                .attr("width", xScale.step())
                .attr("height", yScale.step())
                .attr("fill", function (d) { return bwScale(d.pairs.length); })
                .attr("class", function (d) { return "p" + d.pairs.length; })
                .on("mouseover", function (d) {
                tip.show(d);
            })
                .on("mouseout", function (d) {
                tip.hide();
            })
                .on("click", function (d) {
                var index;
                // let rect_x = d3.event.target.getAttribute('x')
                // let rect_y = d3.event.target.getAttribute('y')
                // console.log(rect_x, rect_y)
                // https://stackoverflow.com/a/20251369/8160230
                // select the rect under cursor
                var curr = d3.select(this);
                // Determine if current rect was clicked before
                var active = d.active ? false : true;
                // Update whether or not the elements are active
                d.active = active;
                // set style in regards to active
                if (d.active) {
                    curr.style("stroke", "yellow").style("stroke-width", 2);
                    info_data.push(d);
                }
                else {
                    curr.style("stroke", "none").style("stroke-width", 2);
                    index = info_data.indexOf(d);
                    info_data.splice(index, 1);
                }
                signprotmat.d3.infoBoxUpdate();
                signprotmat.d3.colorRecResidues(d);
                signprotmat.d3.colorSigResidues(d);
            });
            // * DRAWING AXES
            svg
                .append("g")
                .attr("class", "x axis")
                .attr("transform", "translate(" + -xScale.step() / 2 + "," + h + ")")
                .call(xAxis)
                .selectAll("text")
                .attr("text-anchor", "end")
                .attr("font-size", "12px")
                .attr("dx", "-5px")
                .attr("dy", "-5px")
                .attr("transform", "rotate(-90)");
            svg
                .append("g")
                .attr("class", "y axis")
                .attr("transform", "translate(" + (w - xScale.step()) + "," + yScale.step() / 2 + ")")
                .call(yAxis)
                .selectAll("text")
                .attr("font-size", "12px");
            // * DRAWING GRIDLINES
            svg
                .append("g")
                .attr("class", "x grid")
                .attr("transform", "translate(" + 0 + "," + h + ")")
                .call(xAxisGrid);
            svg
                .append("g")
                .attr("class", "y grid")
                .attr("transform", "translate(" + 0 + "," + yScale.step() + ")")
                .call(yAxisGrid);
            // * ADDITIONAL FIGURE LINES
            // top x line
            svg
                .append("line")
                .style("stroke", "black")
                .attr("x1", 0)
                .attr("y1", yScale.step())
                .attr("x2", w - xScale.step())
                .attr("y2", yScale.step());
            // left y line
            svg
                .append("line")
                .style("stroke", "black")
                .attr("x1", 0)
                .attr("y1", yScale.step())
                .attr("x2", 0)
                .attr("y2", h);
            // * ADD AXIS LABELS
            svg
                .append("text")
                .attr("class", "x axis_label")
                .attr("text-anchor", "end")
                .attr("x", 0)
                .attr("y", h + 15)
                .text("GPCR");
            svg
                .append("text")
                .attr("class", "y axis_label")
                .attr("text-anchor", "begin")
                .attr("x", w - 0.8 * xScale.step())
                .attr("y", 0.8 * yScale.step())
                .text("G-Protein");
            // * ADD INFOBOX ELEMENT
            svg
                .append("g")
                .attr("id", "infobox")
                .attr("transform", "translate(-15," + (data.inttypes.length + 2) * 20 + ")");
            // * ADDING Interaction Type LEGEND
            svg
                .append("g")
                .attr("class", "legendOrdinal")
                .attr("transform", "translate(-30," + yScale.step() + ")");
            var legendOrdinal = d3
                .legendColor()
                .cells(data.inttypes.length)
                .scale(colScale)
                // .cellFilter(function (d) { return d.label !== "undefined" })
                .orient("vertical")
                .labelOffset(-20);
            svg
                .select(".legendOrdinal")
                .call(legendOrdinal)
                .selectAll("rect")
                .attr("rx", 3)
                .attr("ry", 3);
            svg
                .select(".legendOrdinal")
                .selectAll("text")
                .attr("class", "legend")
                .attr("text-anchor", "end");
            // * APPENDING COL TICK ANNOTATION FOR RECEPTOR GNs
            svg
                .append("g")
                .attr("id", "recPDB")
                .attr("transform", "translate(" + 0 + "," + h + ")")
                .selectAll("text")
                .data(data.pdbids)
                .enter()
                .append("text")
                .attr("class", "y seq_label")
                .attr("x", -10)
                .attr("y", function (d) {
                return pdbScale(d) - pdbScale.step() / 2;
            })
                .attr("text-anchor", "end")
                .attr("dy", 75)
                .text(function (d) {
                var i_obj = _.find(interactions_metadata, function (e) { return e.pdb_id === d; });
                var text = i_obj.name.replace("&beta;", "\u03B2"); // beta
                text = text.replace("&mu;", "\u03BC"); // mu
                return text.replace(/<[^>]*>/g, "") + " (" + d.toUpperCase() + ")";
                // return d;
            });
            // * APPENDING ROW TICK ANNOTATION FOR SIGPROT GNs
            svg
                .append("g")
                .attr("id", "sigPDB")
                .attr("transform", "translate(" + w + "," + yScale.step() + ")rotate(-90)")
                .selectAll("text")
                .data(data.pdbids)
                .enter()
                .append("text")
                .attr("class", "x seq_label")
                .attr("x", function (d, i) {
                return 10;
            })
                .attr("y", function (d, i) {
                // return sigScale(d) - sigScale.step() / 2;
                return sigScale(d);
                // return sigScale.step() * (i + 1);
            })
                .attr("text-anchor", "begin")
                .attr("dy", 68)
                .text(function (d) {
                var i_obj = _.find(interactions_metadata, function (e) { return e.pdb_id === d; });
                // let text = i_obj.gprot.replace('Engineered', 'Eng.')
                var text = i_obj.gprot.replace("Engineered", "E.");
                // text = text.replace('protein', 'prot.')
                text = text.replace("protein", "p.");
                return text.replace(/<[^>]*>/g, "") + " (" + d.toUpperCase() + ")";
            });
            // * APPENDING AMINOACID SEQUENCE [RECEPTOR]
            var recTip = d3
                .tip()
                .attr("class", "d3-tip")
                .html(function (d) {
                return ("Signal Prot. AA: " +
                    d.sig_aa +
                    "<br>" +
                    "Interaction type: " +
                    d.int_ty);
            });
            svg
                .append("g")
                .attr("id", "recAA")
                .attr("transform", "translate(" + -xScale.step() / 2 + "," + h + ")")
                .append("rect")
                .attr("class", "border-bg")
                .style("fill", "#ffffff")
                .attr("x", xScale.step() / 2)
                .attr("y", 75)
                .attr("width", xScale.range()[1] - xScale.step())
                .attr("height", pdbScale.range()[0] - pdbScale.step());
            data_non = _.filter(data_non, function (d) {
                return xScale(d.rec_gn);
            });
            data_non = _.filter(data_non, function (d) {
                return pdbScale(d.pdb_id);
            });
            // data.receptor.push(...data_non)
            data_non.push.apply(data_non, data.receptor);
            each_res = svg
                .select("g#recAA")
                .selectAll("text")
                .data(data_non)
                .enter()
                .append("g")
                .attr("class", function (d) { return "R_" + _.replace(d.rec_gn, ".", "p") + "_P_" + d.pdb_id; })
                .call(recTip)
                .on("mouseover", function (d) {
                recTip.show(d);
            })
                .on("mouseout", function (d) {
                recTip.hide();
            });
            each_res
                .append("rect")
                .attr("class", "res_rect")
                .style("fill", function (d) {
                return typeof d.int_ty !== "undefined" ? colScale(d.int_ty[0]) : non_int_col;
            })
                .attr("x", function (d) { return xScale(d.rec_gn) - xScale.step() / 2; })
                .attr("y", function (d) { return 75 + pdbScale(d.pdb_id) - pdbScale.step(); })
                .attr("width", xScale.step())
                .attr("height", pdbScale.step());
            each_res
                .append("text")
                .attr("class", "res_label")
                .attr("x", function (d) { return xScale(d.rec_gn); })
                .attr("y", function (d) { return pdbScale(d.pdb_id) - pdbScale.step() / 2; })
                .attr("text-anchor", "middle")
                .attr("dy", 75)
                .text(function (d) { return d.rec_aa; });
            d3.select("g#recAA")
                .append("rect")
                .attr("class", "border")
                .style("stroke", "black")
                .style("fill", "none")
                .attr("x", xScale.step() / 2)
                .attr("y", 75)
                .attr("width", xScale.range()[1] - xScale.step())
                .attr("height", pdbScale.range()[0] - pdbScale.step());
            // * APPENDING AMINOACID SEQUENCE [SIGPROT]
            var sigTip = d3
                .tip()
                .attr("class", "d3-tip")
                .html(function (d) {
                return ("Receptor AA: " +
                    d.rec_aa +
                    "<br>" +
                    "Interaction type: " +
                    d.int_ty);
            });
            svg
                .append("g")
                .attr("id", "sigAA")
                .attr("transform", "translate(" +
                (w + (1 / 3) * margin.right) +
                "," +
                yScale.step() / 2 +
                ")")
                .append("rect")
                .style("fill", "#ffffff")
                .attr("x", 0 + sigScale.step() / 2)
                .attr("y", yScale.step() / 2)
                .attr("width", sigScale.range()[0] - sigScale.step())
                .attr("height", yScale.range()[0] - yScale.step());
            each_res = svg
                .select("g#sigAA")
                .selectAll("text")
                .data(data.signprot)
                .enter()
                .append("g")
                .attr("class", function (d) { return "S_" + d.sig_gn.replace(/\./gi, "p") + "_P_" + d.pdb_id; })
                .call(sigTip)
                .on("mouseover", function (d) {
                sigTip.show(d);
            })
                .on("mouseout", function (d) {
                sigTip.hide();
            });
            each_res
                .append("rect")
                .style("fill", function (d) { return colScale(d.int_ty[0]); })
                .attr("x", function (d) { return sigScale(d.pdb_id) - sigScale.step() / 2; })
                .attr("y", function (d) { return yScale(d.sig_gn) - yScale.step() / 2; })
                .attr("width", sigScale.step())
                .attr("height", yScale.step());
            each_res
                .append("text")
                .attr("class", "res_label")
                .attr("x", function (d) { return sigScale(d.pdb_id); })
                .attr("y", function (d) { return yScale(d.sig_gn); })
                .attr("text-anchor", "middle")
                .text(function (d) { return d.sig_aa; });
            d3.select("g#sigAA")
                .append("rect")
                .attr("class", "border")
                .style("stroke", "black")
                .style("fill", "none")
                .attr("x", 0 + sigScale.step() / 2)
                .attr("y", yScale.step() / 2)
                .attr("width", sigScale.range()[0] - sigScale.step())
                .attr("height", yScale.range()[0] - yScale.step());
            return svg;
        },
        addReceptor: function (new_data, data, svg) {
            data = _.union(data.transformed, new_data);
            data = signprotmat.data.extractRecSigData(data, "rec");
            var pdb_ids = [];
            _.forEach(_.uniqBy(data, "pdb_id"), function (value) {
                pdb_ids.push(value["pdb_id"]);
            });
            var pdbScale = signprotmat.d3.pdbScale(data);
            var xScale = signprotmat.d3.xScale(data);
            var selection = svg
                .select("g#recAA")
                .selectAll("text.res_label")
                .data(data);
            var selection_rect = svg
                .select("g#recAA")
                .selectAll("rect.res_rect")
                .data(data);
            var selection_enter = selection.enter().append("g");
            selection_enter
                .append("rect")
                .attr("class", "res_rect")
                .style("fill", "slategrey")
                .attr("x", function (d) { return xScale(d.rec_gn) - xScale.step() / 2; })
                .attr("y", function (d) { return 75 + pdbScale(d.pdb_id) - pdbScale.step(); })
                .attr("width", xScale.step())
                .attr("height", pdbScale.step())
                .merge(selection_rect)
                .transition()
                .duration(500)
                .attr("x", function (d) { return xScale(d.rec_gn) - xScale.step() / 2; })
                .attr("y", function (d) { return 75 + pdbScale(d.pdb_id) - pdbScale.step(); })
                .attr("width", xScale.step())
                .attr("height", pdbScale.step());
            selection_enter
                .append("text")
                .attr("class", "res_label")
                .style("fill", "white")
                .attr("x", function (d) { return xScale(d.rec_gn); })
                .attr("y", function (d) { return pdbScale(d.pdb_id) - pdbScale.step() / 2; })
                .attr("text-anchor", "middle")
                .attr("dy", 75)
                .text(function (d) { return d.rec_aa; })
                .merge(selection)
                .transition()
                .duration(500)
                .attr("x", function (d) { return xScale(d.rec_gn); })
                .attr("y", function (d) { return pdbScale(d.pdb_id) - pdbScale.step() / 2; });
            selection
                .exit()
                .transition()
                .duration(500)
                .remove();
            selection_rect
                .exit()
                .transition()
                .duration(500)
                .remove();
            selection = svg
                .select("g#recPDB")
                .selectAll("text")
                .data(pdb_ids);
            selection_enter = selection.enter();
            selection_enter
                .append("text")
                .attr("class", "y seq_label")
                .attr("x", -10)
                .attr("y", function (d) {
                return pdbScale(d) - pdbScale.step() / 2;
            })
                .attr("text-anchor", "end")
                .attr("dy", 75)
                .text(function (d) {
                return d;
            })
                .merge(selection)
                .transition()
                .duration(500)
                .attr("x", -10)
                .attr("y", function (d) {
                return pdbScale(d) - pdbScale.step() / 2;
            })
                .attr("dy", 75);
            selection
                .exit()
                .transition()
                .duration(500)
                .remove();
            d3.select("g#recAA")
                .selectAll("rect.border, rect.border-bg")
                .transition()
                .duration(500)
                .attr("x", xScale.step() / 2)
                .attr("y", 75)
                .attr("width", xScale.range()[1] - xScale.step())
                .attr("height", pdbScale.range()[0] - pdbScale.step());
        },
        colorRecResidues: function (d) {
            var rec_gn = _.replace(d.rec_gn, ".", "p");
            var pdb_list = d.pairs.map(function (x) { return x["pdb_id"]; });
            // select the rect in the g that corresponds to this rec_gn and pdb_id
            pdb_list.forEach(function (pdb) {
                d3.select("g." + "R_" + rec_gn + "_P_" + pdb)
                    .select("rect")
                    .classed("activeRes", d.active ? true : false);
            });
        },
        colorSigResidues: function (d) {
            var sig_gn = d.sig_gn.replace(/\./gi, "p");
            var pdb_list = d.pairs.map(function (x) { return x["pdb_id"]; });
            // select the rect in the g that corresponds to this rec_gn and pdb_id
            pdb_list.forEach(function (pdb) {
                d3.select("g." + "S_" + sig_gn + "_P_" + pdb)
                    .select("rect")
                    .classed("activeRes", d.active ? true : false);
            });
        },
        infoBoxUpdate: function () {
            // create selection and bind data
            var info_box = d3
                .select("g#infobox")
                .selectAll("text")
                .data(info_data);
            // update existing nodes
            info_box
                .attr("y", function (d, i) {
                return i * 15;
            })
                .attr("text-anchor", "end")
                .attr("class", "legend");
            // create nodes for new data
            info_box
                .enter()
                .append("text")
                .attr("y", function (d, i) {
                return i * 15;
            })
                .attr("text-anchor", "end")
                .attr("class", "legend")
                .text(function (d) {
                return d.rec_gn + " : " + d.sig_gn;
            });
            // discard removed nodes
            info_box.exit().remove();
            // print the data again in case it changed
            info_box.text(function (d) {
                return d.rec_gn + " : " + d.sig_gn;
            });
        },
        draw_seq_sig: function (data_in, svg, xScale) {
            var data = data_in.feat;
            var fScale = signprotmat.d3.fScale(data);
            var cScale = signprotmat.d3.cScale(data);
            var feats = [];
            data.forEach(function (d) {
                var length_text = d.length != "" ? " (" + d.length + ")" : "";
                feats.push({
                    code: d.feature_code,
                    feature: d.feature,
                    length: d.length,
                    comb: d.feature + length_text
                });
            });
            var uniq_feats = _.uniqBy(feats, "comb");
            console.log(uniq_feats);
            // filter out NA generic numbers based on xScale
            data = _.filter(data, function (d) {
                return xScale(d.gn);
            });
            var seqsigTip = d3
                .tip()
                .attr("class", "d3-tip")
                .html(function (d) {
                return ("Generic Residue No.: " +
                    d.gn +
                    "<br>" +
                    "Feature: " +
                    d.feature +
                    "<br>" +
                    "Length: " +
                    d.length +
                    "<br>" +
                    // "Score: " +
                    // d.expl +
                    // "<br>" +
                    "Frequency: " +
                    d.freq +
                    "<br>");
            });
            var row = svg
                .append("g")
                .attr("id", "seqsig_feature")
                .attr("transform", "translate(" + 0 + "," + 0 + ")")
                .selectAll("text")
                .data(uniq_feats)
                .enter();
            row
                .append("text")
                .attr("class", "y seq_label")
                .attr("x", -10 - xScale.step())
                .attr("y", function (d) {
                return fScale(d.comb) - fScale.step() / 2;
            })
                .attr("text-anchor", "end")
                .attr("dy", 75)
                .text(function (d) {
                return d.comb;
            });
            row
                .append("rect")
                .style("fill", function (d) {
                var gcol = signprotmat.d3.fScaleColor(d.code);
                if (typeof gcol != "undefined") {
                    return gcol.bg_color;
                }
                else {
                    return null;
                }
            })
                .style("stroke", "black")
                .attr("x", -xScale.step())
                .attr("y", function (d) {
                return 75 + fScale(d.comb) - fScale.step();
            })
                .attr("width", xScale.step())
                .attr("height", fScale.step());
            row
                .append("text")
                .attr("class", "y seq_label")
                .attr("text-anchor", "middle")
                .attr("x", -xScale.step() / 2)
                .attr("y", function (d) {
                return 75 + fScale(d.comb) - fScale.step() / 2;
            })
                .style("fill", function (d) {
                var gcol = signprotmat.d3.fScaleColor(d.code);
                if (typeof gcol != "undefined") {
                    if (typeof gcol.font_color != "undefined") {
                        return gcol.font_color;
                    }
                    else {
                        return "#000000";
                    }
                }
                else {
                    return "#000000";
                }
            })
                .text(function (d) {
                return d.code;
            });
            svg
                .append("g")
                .attr("id", "seqsig_mat")
                .attr("transform", "translate(" + -xScale.step() / 2 + "," + 0 + ")")
                .append("rect")
                .attr("class", "border-bg")
                .style("fill", "#ffffff")
                .attr("x", xScale.step() / 2)
                .attr("y", 75)
                .attr("width", xScale.range()[1] - xScale.step())
                .attr("height", fScale.range()[1] - fScale.step());
            var each_res = svg
                .select("g#seqsig_mat")
                .selectAll("text")
                .data(data)
                .enter()
                .append("g")
                .call(seqsigTip)
                .on("mouseover", function (d) {
                if (d.freq !== 0) {
                    seqsigTip.show(d);
                }
            })
                .on("mouseout", function (d) {
                seqsigTip.hide();
            });
            // the rectangles, colored by conservation
            each_res
                .append("rect")
                .attr("class", "res_rect")
                .style("fill", function (d) {
                if (d.cons <= 0) {
                    return "none";
                }
                else {
                    return cScale(d.freq);
                }
            })
                .attr("x", function (d) { return xScale(d.gn) - xScale.step() / 2; })
                .attr("y", function (d) {
                var length_text = d.length != "" ? " (" + d.length + ")" : "";
                var comb = d.feature + length_text;
                return 75 + fScale(comb) - fScale.step();
            })
                .attr("width", xScale.step())
                .attr("height", fScale.step());
            // adding the frequency text to each rectangle
            // each_res
            //   .append("text")
            //   .attr("class", "res_label")
            //   .attr("x", (d: any) => xScale(d.gn))
            //   .attr("y", (d: any) => fScale(d.feature) - fScale.step() / 2)
            //   .style("fill", (d: any) => {
            //     if(Math.abs(d.freq) >= 50) {
            //       return '#eaeaea';
            //     } else if (Math.abs(d.freq) < 50) {
            //       return '#000000';
            //     }
            //   })
            //   .attr("text-anchor", "middle")
            //   .attr("dy", 75)
            //   .text((d: any) => d.freq);
            // .text((d: any) => _.round(d.freq/100, 1));
            // putting a black border around the signature
            d3.select("g#seqsig_mat")
                .append("rect")
                .attr("class", "border")
                .style("stroke", "black")
                .style("fill", "none")
                .attr("x", xScale.step() / 2)
                .attr("y", 75)
                .attr("width", xScale.range()[1] - xScale.step())
                .attr("height", fScale.range()[1] - fScale.step());
            // * ADDING COLOR LEGEND
            svg
                .append("g")
                .attr("class", "legendSeqSig")
                .attr("transform", "translate(-200,20)");
            var legendSeqSig = d3
                .legendColor()
                .cells(5)
                .labelFormat(d3.format(""))
                .title("Scale in %")
                .scale(cScale)
                .orient("horizontal")
                .shapeWidth(30);
            svg
                .select(".legendSeqSig")
                .call(legendSeqSig)
                .selectAll("rect")
                .attr("rx", 3)
                .attr("ry", 3)
                .style("stroke", "black")
                .style("stroke-width", "0.1px");
            svg
                .select(".legendSeqSig")
                .selectAll("text")
                .attr("class", "legend");
        },
        draw_seq_cons: function (data_in, svg, xScale, xAxis, sigmatch) {
            var data = data_in.cons;
            var fScale = signprotmat.d3.fScale(data);
            var cScale = signprotmat.d3.cScale(data);
            var uniq_feats = _.uniq(_.map(data, "feature"));
            // filter out NA generic numbers based on xScale
            data = _.filter(data, function (d) {
                return xScale(d.gn);
            });
            var conseqTip = d3
                .tip()
                .attr("class", "d3-tip")
                .html(function (d) {
                return ("Generic Residue No.: " +
                    d.gn +
                    "<br>" +
                    "Feature: " +
                    d.feature +
                    "<br>" +
                    "Length: " +
                    d.length +
                    "<br>" +
                    "Score: " +
                    d.score +
                    "<br>");
            });
            if (sigmatch) {
                svg = svg.append("g")
                    .attr("transform", "translate(" + margin.left + "," + (margin.top + 140) + ")");
                svg
                    .append("g")
                    .attr("id", "sigmatch_mat")
                    .attr("transform", "translate(" + -xScale.step() / 2 + "," + -30 + ")")
                    .append("rect")
                    .attr("class", "border-bg")
                    .style("fill", "#ffffff")
                    .attr("x", xScale.step() / 2)
                    .attr("y", 75)
                    .attr("width", xScale.range()[1] - xScale.step())
                    .attr("height", 75);
                svg
                    .append("text")
                    .attr("class", "y seq_label")
                    .attr("text-anchor", "end")
                    .attr("x", -10)
                    .attr("y", 65)
                    .text("Property");
                svg
                    .append("text")
                    .attr("class", "y seq_label")
                    .attr("text-anchor", "end")
                    .attr("x", -10)
                    .attr("y", 102)
                    .text("Conservation");
            }
            else {
                svg
                    .append("g")
                    .attr("id", "conseq_mat")
                    .attr("transform", "translate(" + -xScale.step() / 2 + "," + -30 + ")")
                    .append("rect")
                    .attr("class", "border-bg")
                    .style("fill", "#ffffff")
                    .attr("x", xScale.step() / 2)
                    .attr("y", 75)
                    .attr("width", xScale.range()[1] - xScale.step())
                    .attr("height", 75);
                svg
                    .append("g")
                    .attr("class", "x axis")
                    .attr("transform", "translate(" + -xScale.step() / 2 + "," + 35 + ")")
                    .call(xAxis)
                    .selectAll("text")
                    .attr("text-anchor", "start")
                    .attr("font-size", "12px")
                    .attr("dx", "-5px")
                    .attr("dy", "-5px")
                    .attr("transform", "rotate(-90)");
                svg
                    .select(".x.axis")
                    .selectAll("path")
                    .remove();
                svg
                    .append("text")
                    .attr("class", "y seq_label")
                    .attr("text-anchor", "end")
                    .attr("x", -10)
                    .attr("y", 65)
                    .text("Property");
                svg
                    .append("text")
                    .attr("class", "y seq_label")
                    .attr("text-anchor", "end")
                    .attr("x", -10)
                    .attr("y", 102)
                    .text("Conservation");
            }
            var each_res = svg
                .select("g#conseq_mat")
                .selectAll("text")
                .data(data)
                .enter()
                .append("g")
                .call(conseqTip)
                .on("mouseover", function (d) {
                conseqTip.show(d);
            })
                .on("mouseout", function (d) {
                conseqTip.hide();
            });
            // the rectangles, colored by feature
            each_res
                .append("rect")
                .attr("class", "res_rect")
                .style("fill", function (d) {
                var gcol = signprotmat.d3.fScaleColor(d.code);
                if (typeof gcol != "undefined") {
                    return gcol.bg_color;
                }
                else {
                    return null;
                }
            })
                .attr("x", function (d) { return xScale(d.gn) - xScale.step() / 2; })
                .attr("y", function (d) { return 75; })
                .attr("width", xScale.step())
                .attr("height", 37.5);
            // the rectangles, colored by conservation
            each_res
                .append("rect")
                .attr("class", "res_rect")
                .style("fill", function (d) {
                if (d.cons === -1) {
                    return "#ffffff";
                }
                else {
                    return cScale(d.score);
                }
            })
                .attr("x", function (d) { return xScale(d.gn) - xScale.step() / 2; })
                .attr("y", function (d) { return 75 + 37.5; })
                .attr("width", xScale.step())
                .attr("height", 37.5);
            // adding the feature text to each rectangle
            each_res
                .append("text")
                .attr("class", "res_label")
                // .attr("x", (d: any) => xScale(d.gn))
                // .attr("y", (d: any) => 50)
                .attr("transform", function (d) { return "translate(" + xScale(d.gn) + ",93.75)"; } // + "rotate(270)"
            )
                .style("fill", function (d) {
                var gcol = signprotmat.d3.fScaleColor(d.code);
                if (typeof gcol != "undefined") {
                    if (typeof gcol.font_color != "undefined") {
                        return gcol.font_color;
                    }
                    else {
                        return "#000000";
                    }
                }
                else {
                    return "#000000";
                }
            })
                .attr("text-anchor", "middle")
                .text(function (d) { return d.code; });
            // adding the conservation value to each rectangle
            each_res
                .append("text")
                .attr("class", "res_label")
                // .attr("x", (d: any) => xScale(d.gn))
                // .attr("y", (d: any) => 50)
                .attr("transform", function (d) {
                return "translate(" + xScale(d.gn) + "," + (75 + 37.5 + 37.5 / 2) + ")";
            } // + "rotate(270)"
            )
                .style("fill", function (d) {
                if (Math.abs(d.score) >= 50) {
                    return "#eaeaea";
                }
                else if (Math.abs(d.score) < 50) {
                    return "#000000";
                }
            })
                .attr("text-anchor", "middle")
                .text(function (d) { return d.score; });
            // putting a black border around the signature
            d3.select("g#conseq_mat")
                .append("rect")
                .attr("class", "border")
                .style("stroke", "black")
                .style("fill", "none")
                .attr("x", xScale.step() / 2)
                .attr("y", 75)
                .attr("width", xScale.range()[1] - xScale.step())
                .attr("height", 75);
        }
    }
};
