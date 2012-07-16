var Pareidolia = new function() {

    var seeding;
    var genCount;
    var lastImprovedGen;
    var faceA, faceB;
    var canvasA, canvasB, scoreA, scoreB, output;
    var interval;

	var settings = {
       CANVAS_SIZE : 50,
       INITIAL_POLYS : 60,
	   MAX_POLYS : 1000,
	   MAX_GENERATIONS : 6000,
	   MAX_GENS_WITHOUT_IMPROVEMENT : 1000,
       CONFIDENCE_THRESHOLD : 30,
       QUAD_ADD_STDDEV : 0.5,
       QUAD_INIT_STDDEV : 0.2,
       BG_COLOR : "#1E1E1E"
	};

    this.stop = function() {
        if (interval) {
            clearInterval(interval);
            interval = null;
        }
    }

    this.start = function(args) {
        
        if (args) {
            if (args.canvasSize) {
                settings.CANVAS_SIZE = args.canvasSize;
            }
            if (args.confidenceThreshold) {
                settings.CONFIDENCE_THRESHOLD = args.confidenceThreshold;
            }
            if (args.maxGenerations) {
                settings.MAX_GENERATIONS = args.maxGenerations;
            }
        }

        canvasA = document.getElementById("canvasA");
        scoreA = document.getElementById("scoreA");
        canvasB = document.getElementById("canvasB");
        scoreB = document.getElementById("scoreB");
        output = document.getElementById("output");

        reset();
        interval = setInterval(tick,10);
    }

    var reset = function() {

        initCanvas(canvasA);
        clearCanvas(canvasA);
        initCanvas(canvasB);
        clearCanvas(canvasB);
        scoreA.innerHTML = "Waiting for initial detection ... patience";
        scoreB.innerHTML = "";

        faceA = new Face([]);
        faceB = null;
        genCount = 0;
        lastImprovedGen = 0;
        seeding = true;
    }   

    var rnd = function(mean, stdev) {
        
        // pinched from http://www.protonfish.com/random.shtml
		return ((Math.random()*2-1)+(Math.random()*2-1)+(Math.random()*2-1))*stdev+mean;
	};

    var initCanvas = function(canvas) {

        canvas.width = canvas.height = settings.CANVAS_SIZE;
        
        // set origin at center
        canvas.getContext("2d").setTransform(1, 0, 0, 1, settings.CANVAS_SIZE/2, settings.CANVAS_SIZE/2);
    }

    var clearCanvas = function(canvas) {

        var ctx = canvas.getContext("2d");
        ctx.fillStyle = settings.BG_COLOR;
        ctx.globalAlpha = 1;
        ctx.fillRect(-settings.CANVAS_SIZE/2,-settings.CANVAS_SIZE/2,settings.CANVAS_SIZE,settings.CANVAS_SIZE);
    }

    var getSeedFace = function() {

            // create a bunch of randomish quads to kick things off
            var quads = [];
            for (var i=0; i<settings.INITIAL_POLYS; i++) {
                
                quads[i] = new Quad(
                        [rnd(0,settings.CANVAS_SIZE/10),rnd(-settings.CANVAS_SIZE/8,settings.CANVAS_SIZE/6)],
                        rnd(settings.CANVAS_SIZE/3,settings.CANVAS_SIZE/7.5),
                        rnd(0.02,0.2),
                        settings.QUAD_INIT_STDDEV
                );
            }

            return new Face(quads);
    }

    var tick = function() {

        if (seeding) {
            // spam random polys until ccv gets a false positive
            faceB = getSeedFace();
        } else {
            // evolve previous generation
            faceB = faceA.produceChild();
            genCount++;
        }

        clearCanvas(canvasB);
        faceB.draw(canvasB.getContext("2d"));

        var fitness = faceB.measureFitness(canvasB);

        var fitnessScore = -999;
        var message = "Gen: "+genCount+", ";

        if (fitness.numFaces > 1) {
            // only want to make one face
            message = message + "multiple faces";
        } else if (fitness.numFaces == 0) {
            message = message + "no faces detected";
        } else if (fitness.bounds.width < settings.CANVAS_SIZE/2 || fitness.bounds.height < settings.CANVAS_SIZE/2) {
            // don't want tiny features detected as faces
            message = message + "face too small";
        } else {
            fitnessScore = fitness.confidence;
            message = message + "fitness: " + String(fitnessScore).substr(0,10);
        }

        scoreB.innerHTML = message;

        if (fitnessScore > faceA.fitness) {
            seeding = false;

            clearCanvas(canvasA);
            faceB.draw(canvasA.getContext("2d"));
            faceB.drawBounds(canvasA.getContext("2d"));
            scoreA.innerHTML = message;

            lastImprovedGen = genCount;
            faceA = faceB;
        }

        if (genCount > settings.MAX_GENERATIONS || 
                (genCount - lastImprovedGen) > settings.MAX_GENS_WITHOUT_IMPROVEMENT || 
                fitnessScore > settings.CONFIDENCE_THRESHOLD) {

            faceA.draw(canvasB.getContext("2d"));
            var dataUrl = canvasB.toDataURL();
            
            var outputImg = document.createElement("img");
            output.appendChild(outputImg);
            outputImg.src =  dataUrl;

            reset();
        }
    }


    var Quad = function(origin, scale, alpha, stdDev) {

        // Create quad with corners on unit square, perturbed by stdDev
        this.points = [
            [rnd(-0.5,stdDev),rnd(-0.5,stdDev)],
            [rnd(0.5,stdDev),rnd(-0.5,stdDev)],
            [rnd(0.5,stdDev),rnd(0.5,stdDev)],
            [rnd(-0.5,stdDev),rnd(0.5,stdDev)]
        ];

        this.draw = function(ctx) {
            
                   ctx.save();
                   ctx.translate(origin[0],origin[1]);
                   ctx.scale(scale,scale);
                   ctx.beginPath();

                   for (var i=0; i<4; i++) {
                       ctx.lineTo(this.points[i][0],this.points[i][1]);
                   }

                   ctx.closePath();

                   if (alpha > 0) {
                       ctx.fillStyle = "#ffffff";
                       ctx.globalAlpha = alpha;
                   } else {
                       ctx.fillStyle = "#000000";
                       ctx.globalAlpha = -alpha;
                   }

                   ctx.fill();
                   ctx.restore();
        } 
    };

    var Face = function(quads) {
        
               this.quads = quads;

               this.fitness = -999;

               this.bounds = { 
                   x: 0, 
                   y: 0, 
                   width: settings.CANVAS_SIZE, 
                   height: settings.CANVAS_SIZE
               };

               this.produceChild = function() {

                   var childQuads = [];
                   
                   for (var i=0; i<this.quads.length; i++) {
                       childQuads[i] = this.quads[i];
                   }

                   // Increase prob of removing a poly as we approach max
                   if (Math.random() * settings.MAX_POLYS < childQuads.length) {

                       var victimIdx = Math.floor(Math.random()*childQuads.length);
                       childQuads.splice(victimIdx,1);
                   } else {

                       // centre new poly generation on the bounds of the detected face
                       var newOrigin = [
                                rnd(this.bounds.x + this.bounds.width/2, this.bounds.width/4),
                                rnd(this.bounds.y + this.bounds.height/2, this.bounds.height/4)
                            ];

                       var newScale =  35 > this.fitness ? Math.sqrt(Math.abs(35-this.fitness)) : 1;
                       var newAlpha = rnd(0, 0.45);
                       newAlpha = newAlpha > 1.0 ? 1.0 : newAlpha < -1.0 ? -1.0 : newAlpha;
                       childQuads[childQuads.length] = new Quad(
                               newOrigin, newScale, newAlpha, settings.QUAD_ADD_STDDEV
                               );
                   }

                   return new Face(childQuads);
               }

               this.draw = function(ctx) {
                   var numQuads = this.quads.length;
                   for (var i=0; i<numQuads; i++) {
                       this.quads[i].draw(ctx);
                   }
               }

               this.drawBounds = function(ctx) {
                   ctx.globalAlpha = 1;
                   ctx.strokeStyle = "#00ff00";
                   ctx.strokeRect(this.bounds.x,this.bounds.y,this.bounds.width,this.bounds.height);
               }

               this.measureFitness = function(canvas) {

                   // ask ccv to do the hard part
                   var comp = ccv.detect_objects({ "canvas" : canvas,
                       "cascade" : cascade,
                       "interval" : 5,
                       "min_neighbors" : 1 });

                   if (comp.length == 1) {
                       comp[0].x -= canvas.width/2;
                       comp[0].y -= canvas.height/2;

                       this.bounds.x = comp[0].x;
                       this.bounds.y = comp[0].y;
                       this.bounds.width = comp[0].width;
                       this.bounds.height = comp[0].height;

                       this.fitness = comp[0].confidence;
                   }

                   return {numFaces : comp.length, bounds : this.bounds, confidence : this.fitness};
               }
    }
}
