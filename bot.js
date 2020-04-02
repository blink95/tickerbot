const Discord = require('discord.js');
var prefix = '!'; //what the user will say in the channel for all of this to work correctly
var auth = ""; //add in your own Discord API key for your bot
const client = new Discord.Client();
const request = require('request');


function TDA_build_url(command,args){
  var api = ""; //add in your own TD Ameritrade API key to extract JSON file
  var symb = String(args[0].toUpperCase());
  var tyear = "";
  var tmonth = "";
  var tday ="";
  var to="";
  if (command==='oi'){ //specific variables only available to the Open Interest command
    var today = new Date();
    var todayday = String(today.getDate()).padStart(2, '0');
    var todaymonth = String(today.getMonth() + 1).padStart(2, '0');
    var todayyear = String(today.getFullYear());
    var todayDate = todayyear+"-"+todaymonth+"-"+todayday; //concatenation of today's date from system.Date
    var strike_c = ""; //used for strike count margins
  }
  else if (command==="p"){ //specific variables only available to the Price Information command
    var str = String(args[1].slice(0,-1)); //extracting only the strike price
    var c_p = args[1].charAt(args[1].length-1).toLowerCase(); //checking if the user wants a call or put
    var opt = (c_p==='c')? "CALL": (c_p==='p')? "PUT": "ERROR"; 
    var fdate = args[2].split("/");
    var fyear = (fdate.length===2)?"2020" : (fdate[2].length===4)?fdate[2] : ("20"+fdate[2]);
    var fmonth = (fdate[0].length===2)?fdate[0] : ("0"+fdate[0]);
    var fday = (fdate[1].length===2)?fdate[1] : ("0"+fdate[1]);
    var from = fyear+"-"+fmonth+"-"+fday; //concatenation for the fromDate line in the HTTP request url
  }
  //for certain tickers, there are tens of thousands of contracts in the JSON file that make it longer to process
  //these lines make it a little easier for the user if they want a "sample mode" that pulls in only a margin of stock options
  //the margin is how many strike prices above the market price, and how many strike prices below the market price
  //by shortening the margin, there is less parsing that the bot needs to do, and it makes it faster, but less accurate
  //this is only an issue with high open interest stocks like SPY and SPX, and a few others listed in the below array
  var high_open_interest = ["SPY","SPX","VIX","EEM","QQQ","HYG","IWM","GLD","FXI","XLF","SLV","GE","EFA","BAC","VXX"]; 
  if (high_open_interest.includes(symb)){
    var newmonth = parseInt(todaymonth)+5; //set a toDate that is only 5 months ahead, shortening the expiry dates requested
    tyear = (newmonth>12)? String(parseInt(todayyear)+1): todayyear;
    tmonth = ((newmonth!=12) && String(newmonth%12).length===1)? "0"+String(newmonth%12) : String(newmonth);
    tday = "01";
    to = tyear+"-"+tmonth+"-"+tday;
    //var strike_c = "&strikeCount=15"; //set a margin of above/below market price, shortening the amount of parsing the bot needs to do on the JSON (less accurate)
  }

  var base = "https://api.tdameritrade.com/v1/marketdata/chains?"+"apikey="+api+"&symbol="+symb; //this is the base of every HTTP request url sent to TD Ameritrade API
  var price_info = base+"&contractType="+opt+"&strike="+str+"&fromDate="+from+"&toDate="+to; //this is the request for price info in a url
  var open_interest = base+strike_c+"&fromDate="+todayDate+"&toDate="+to; //this is the request for open interest info in a url
  var complete_url = (command==="oi")? open_interest : price_info; //this is the final url we want to send to TDA based off our earlier command input
  
  return complete_url;
}





client.on('ready', () => {
 console.log(`Logged in as ${client.user.tag}!`);
 });

client.on("message", async message => {
  // This event will run on every single message received, from any channel or DM.
  // It's good practice to ignore other bots. This also makes your bot ignore itself
  // and not get into a spam loop (we call that "botception").
  if(message.author.bot) return;
  
  // Also good practice to ignore any message that does not start with our prefix, 
  // which is set in the configuration file.
  if(message.content.indexOf(prefix) !== 0) return;
  // Here we separate our "command" name, and our "arguments" for the command. 
  // e.g. if we have the message "+say Is this the real life?" , we'll get the following:
  // command = say
  // args = ["Is", "this", "the", "real", "life?"]
  const args = message.content.slice(prefix.length).split(/ +/);
  const command = args.shift().toLowerCase();




  if(command === "p"){ //if someone wants Price Information on a stock option in the Discord server
      if (args.length == 0){
        message.channel.send("You can say something like '!p TSLA 750c 4/17'. Please follow the correct format and try again.");
        console.log(">>>>>>>>>>>>>>ERR: User did not insert arguments");
        return;
      }
      var complete_url = TDA_build_url(command,args); // where we build our url to be passed to the HTTP request
      request({url: complete_url, json: true}, function(err, res, json) { // HTTP request to TD Ameritrade API
        res.on('end', () => {
          console.log("JSON received successfully...");
        })
        if (err) {
          throw err;
          message.channel.send("I'm experiencing an error with your request. Please try again.");
          console.log(">>>>>>>>>>>ERR: HTTP Request error");
          return;
        }
        try{
          var c_p = args[1].charAt(args[1].length-1).toLowerCase();
          var opt = (c_p==='c')? "CALL":(c_p==='p')? "PUT":"ERROR"; 
          var call = opt.toLowerCase()+"ExpDateMap";
          var level1 = json[call]; //the first level of the JSON file; call or put
          var level2 = level1[Object.keys(level1)[0]]; //second level; expiry dtes
          var level3 = level2[Object.keys(level2)[0]][0]; //third level; all strike prices for each expiry date
          var itm = level3["inTheMoney"]===true? "ITM" : "OTM"; 
          var markPercent = level3["markPercentChange"]; 
          var colorset = (markPercent>0)? "#33ff5b": (markPercent<0)? "#f81313":"#feef00"; //this changes the color of the embed if this option is increasing or decreasing
          const dmessage = new Discord.MessageEmbed()
            .setDescription("$"+String(level3["description"]).toUpperCase()+" **("+itm+")**"+'\n') //first line in the embed
            .addFields( //these are the fields that we can add to our embed
              { 
                name: "Limit Price",
                value:("bid: **"+String(level3["bid"])+"  x"+String(level3["bidSize"])+"**"+'\u2003'+'\u2003'+'\n'
                      +"ask: **"+String(level3["ask"])+"  x"+String(level3["askSize"])+"**"+'\u2003'+'\u2003'+'\n'
                      +"mrk: **"+String(level3["mark"])+"**"+'\u2003'+'\u2003'+'\n'
                      +"%ch: **"+markPercent.toFixed(2)+"**"+'\u2003'+'\u2003'+'\n'
                      +"DTE: **"+String(level3["daysToExpiration"])+"d**"+'\u2003'+'\u2003'+'\n'),
                inline: true //means make on the same line
              },
              {
                name: "Stats",
                value:("hiP: **"+String(level3["highPrice"])+"**"+'\u2003'+'\u2003'+'\u2003'+'\n'
                      +"loP: **"+String(level3["lowPrice"])+"**"+'\n'
                      +"vol: **"+String(level3["totalVolume"])+"**"+'\n'
                      +"OI: **"+String(level3["openInterest"])+"**"+'\n'
                      +"IV: **"+String(level3["volatility"].toFixed(2))+"**"),
                inline:true //same line as Limit Price
              },
              {
                name: "Greeks",
                value:("del: **"+String(level3["delta"])+"**"+'\n'
                      +"gam: **"+String(level3["gamma"])+"**"+'\n'
                      +"the: **"+String(level3["theta"])+"**"+'\n'
                      +"veg: **"+String(level3["vega"])+"**"+'\n'
                      +"rho: **"+String(level3["rho"])+"**"+'\n'),
                inline:true //same line as Greeks
              })
            .setColor(colorset) //set the color according to the earlier logic
          message.channel.send(dmessage); //send the final embedded message to the Discord server
        }
        catch(err){
          message.channel.send("I'm experiencing an error with your request. Please try again.");
          console.log(">>>>>>>>>ERR: JSON read error or Discord write error");
          return;
        }
      });
    }

  else if (command === "oi"){ //if someone wants Open Interest information on the Discord server
      if (args.length == 0){
        message.channel.send("You can say something like '!oi MSFT'. Please follow the correct format and try again.");
        console.log(">>>>>>>>>>>>>>ERR: User did not insert arguments");
        return;
      }
      var complete_url = TDA_build_url(command,args); //url built for HTTP request
      request({url: complete_url, json: true}, function(err, res, json) { //HTTP request
      res.on('end', () => {
        console.log("JSON received successfully...");
      })
      if (err) {
        throw err;
        message.channel.send("I'm experiencing an error with your request. Please try again.");
        console.log(">>>>>>>>>>>ERR: HTTP Request error");
        return;
      }

      try{
        var symbol = String(args[0].toUpperCase());
        if (args.length==2){
          var listheight = parseInt(args[1]); //let the user set how long they want the list to be (this influences time for completion)
        }
        var clevel1 = json["callExpDateMap"]; //we need to search on both call and puts in the JSON file to add in 'open interest' integers
        var clevel1k = Object.keys(clevel1);
        var plevel1 = json["putExpDateMap"]; //same as above reason
        var plevel1k = Object.keys(plevel1); //this gives us a short list of all expiry dates and no other information
        var Dates = ""; //used for the Embed
        var OpenInt = ""; //same as above
        var CallPutPer = ""; //same as above
        var call_c = 0; // used for colorset
        var put_c = 0; //same as above
        var expirydates = (plevel1k.length>=listheight) ? listheight: plevel1k.length; //if there are less expiry dates than the number we provided, show all of the expiry dates
        for (var i= 0; i<expirydates; i++){
          var oi_c =0; //this is where we keep a count of each open interest in each iteration; calls
          var oi_p = 0; //same as above; puts
          clevel2 = clevel1[clevel1k[i]];//access second level; calls
          clevel2k = Object.keys(clevel2); //show us a list of all strike prices
          plevel2 = plevel1[plevel1k[i]]; //same as above; puts
          plevel2k = Object.keys(plevel2); //same as above
          for (var j=0; j<clevel2k.length; j++){
            clevel3 = clevel2[clevel2k[j]][0]; //access the third level where the Open Interest field lies, using the strike price as a key to Level 2
            oi_c+=clevel3["openInterest"]; //add the found open interest count to the overall count; calls
            call_c+=clevel3["openInterest"]; //add to colorset
          }
          for (var j=0; j<plevel2k.length; j++){ //same as above but for puts
            plevel3 = plevel2[plevel2k[j]][0]; //add the found open interest count to the overall count; puts
            oi_p+=plevel3["openInterest"]; //add the found open interest count to the overall count; puts
            put_c+=plevel3["openInterest"]; //add to colorset
          }
          var date = String(clevel1k[i]).slice(0,String(clevel1k[i]).indexOf(":")); //extract the correct date information form the JSON to the embed
          var callPer = (((oi_c*1.0)/(oi_c+oi_p))*100); //call open interest divided by total open interest times 100
          var putPer = (((oi_p*1.0)/(oi_c+oi_p))*100); //put open interest divided by total open interest times 100
          Dates += (date.slice(5,date.length)+"-"+date.slice(2,4)+'\u2003'+'\u2003'+'\n'); //add all of the information together for Embed
          OpenInt += (String(oi_c+oi_p)+'\u2003'+'\u2003'+'\n'); //same as above
          CallPutPer += (callPer.toFixed(0)+'\u2003'+'\u2003'+'\u2003'+putPer.toFixed(0)+'\n'); //same as above
        }
        var colorset = (call_c>put_c)? "#33ff5b": (put_c>call_c)? "#f81313":"#feef00"; //if there are more calls than puts, make the embed green, otherwise make it red
        const dmessage = new Discord.MessageEmbed() 
          .setDescription("$"+symbol+" OPEN INTEREST BY EXP. DATE"+'\n') //first line of the embedded messag
          .addFields( //list of fields with their information from above plugged into the embed
            { name: 'Date', value: Dates, inline: true},
            { name: 'Open Int.', value: OpenInt, inline: true},
            { name: 'Call%   Put%', value: CallPutPer, inline: true}, //all on the same line
          )
          .setColor(colorset) //add the colorset to the embed
        message.channel.send(dmessage); //send the complete final message to the Discord server

      }
      catch(err){
        message.channel.send("I'm experiencing an error with your request. Please try again.");
        console.log(">>>>>>>>>ERR: JSON read error or Discord write error");
        return;
      }
      return;
    });
  }

  else if (command === "tbhelp"){ //if a user needs help on the current available commands, send them this string of information
      message.channel.send("((1)) Show price information for a specific option :::::::: !p [ticker][strike price + c/p][exp date MM/DD/YYYY] ::::::  example =>   '!p spy 300c 4/3'     '!p tsla 400p 5/21/20'"+'\n'
      +"((2)) Show open interest and put/call percentages for several expiry dates :::::::: !oi [ticker] ::::::  example =>   '!oi spy'     '!oi tsla'");
  }
});

client.login(auth); //login to the Discord client