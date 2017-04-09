'use strict';

const bodyParser = require('body-parser');
const request = require('request');
const BootBot = require('bootbot');
const express = require('express');
const app = express();
const MONGO_URL = process.env.MONGO_URL;
const FB_ACCESS_TOKEN = process.env.FB_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const APP_SECRET = process.env.APP_SECRET;
const STACK_KEY = process.env.STACK_KEY;
const STACK_CLIENT_SECRET = process.env.STACK_CLIENT_SECRET;
var MongoClient = require('mongodb').MongoClient;
var mydb, stackusers, userIds = [];
MongoClient.connect(MONGO_URL, function (err, db) {
    mydb = db;
    if (err) {
        console.log(err);
    } else {
        setInterval(getUserInfo, 300000)
        console.log("==== database connected whoohooo ====");
    }
})

const bot = new BootBot({
    accessToken: FB_ACCESS_TOKEN,
    verifyToken: VERIFY_TOKEN,
    appSecret: APP_SECRET
});

function addUserToDB(accessToken) {
    mydb.collection("stackusers").findOneAndUpdate({
        'userId': userIds.pop()
    }, {
        $set: {
            'accessToken': accessToken
        }
    }, {
        upsert: true
    }, function (err, post) {
        if (err) {
            console.log(err);
        } else {
            console.log(post);
        }
    })
}

function getUnreadInbox(user) {
    request.get({
        uri: 'https://api.stackexchange.com/2.2/me/inbox/unread?site=stackoverflow&key=' + STACK_KEY + '&page=1&pagesize=12&access_token=' + user.accessToken,
        gzip: true
    }, function (error, response, body) {
        if (error) {
            console.log(error);
            return;
        } else {
            let jsonbody = JSON.parse(body);
            if (jsonbody["items"] && jsonbody["items"].length > 0) {
                jsonbody["items"].forEach(function (item) {
                    if (item["creation_date"] * 1000 > (new Date().getTime() - 300800)) {
                        bot.say(user.userId, {
                            text: 'You got a reply in ' + item["item_type"] + '\n\n"' + item["title"] + '"',
                            buttons: [{
                                type: 'web_url',
                                title: 'Visit post',
                                url: item["link"]
                            }]
                        });
                    }
                })
            }
        }
    })
}

function getUnreadReputationChanges(user) {
    request.get({
        uri: 'https://api.stackexchange.com/2.2/me/reputation?site=stackoverflow&key=' + STACK_KEY + '&access_token=' + user.accessToken,
        gzip: true
    }, function (error, response, body) {
        if (error) {
            console.log(error)
            return;
        } else {
            let jsonbody = JSON.parse(body);
            if (jsonbody["items"] && jsonbody["items"].length > 0) {
                jsonbody["items"].forEach(function (item) {
                    if (item["on_date"] * 1000 > (new Date().getTime() - 305000)) {
                        bot.say(user.userId, {
                            text: "+" + item["reputation_change"] + ", " + item["vote_type"].replace(/_/g, " "),
                            buttons: [{
                                type: 'web_url',
                                title: 'Visit post',
                                url: 'https://stackoverflow.com/q/' + item["post_id"]
                            }]
                        });
                    }
                })
            }
        }
    })
}

function getUserInfo() {
    mydb.collection("stackusers").find().toArray(function (err, items) {
        items.forEach(function (user) {
            getUnreadInbox(user)
            getUnreadReputationChanges(user)
        })
    })
}

function getAccessToken(code) {
    request.post({
        headers: {
            'content-type': 'application/x-www-form-urlencoded'
        },
        url: 'https://stackexchange.com/oauth/access_token',
        form: {
            code: code,
            client_id: 9261,
            client_secret: STACK_CLIENT_SECRET,
            redirect_uri: 'https://stack-unread-notifier.herokuapp.com/register'
        }
    }, function (error, response, body) {
        console.log(body.substr(body.indexOf("=") + 1));
        const accessToken = body.substr(body.indexOf("=") + 1);
        addUserToDB(accessToken);
    });
}

bot.app.get('/register', function (req, res) {
    res.sendFile('register.html', {
        root: __dirname
    });
});

bot.app.get('/registered-code', function (req, res) {
    console.log(req.query);
    if (req.query.code) {
        res.send("OK");
        getAccessToken(req.query.code)
    }
})

bot.app.get('/privacy', function (req, res) {
    res.send('<h2 style="padding: 30px; font-family: consolas; text-decoration:underline">The StackBot</h2><p style="font-family: consolas; font-size: 18px; padding: 10px 30px">This is built solely for learning purposes and is not intended for any kind of commercial activity and hence we do not collect any kind of user\'s personal information at all. We honor user\'s privacy and do not track anything at all. It is not developed in order to attract anyone under 13.</p>');
});

bot.hear([/.*/], (payload, chat) => {
    mydb.collection("stackusers").findOne({
        'userId': payload.sender.id
    }, function (err, post) {
        if (err) {
            console.log(err);
        } else {
            console.log(post)
            if (post) {
                chat.say("Doesn't look like anything to me!");
            } else {
                userIds.push(payload.sender.id);
                chat.say({
                    text: "Hey... you're new.. not much of a rind on you! :D \n\nI'm the StackBot! \nI send your StackOverflow notifications/inbox here! :D",
                    buttons: [{
                        type: 'web_url',
                        title: 'Let\'s get started!',
                        url: 'https://stackexchange.com/oauth?client_id=9261&scope=read_inbox,no_expiry&redirect_uri=https://stack-unread-notifier.herokuapp.com/register'
                    }]
                });
            }
        }
    })
});

bot.start(process.env.PORT || 3000);
