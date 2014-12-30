/*jslint node: true */
"use strict";

var http = require('follow-redirects').https;

var environment = process.env.Environment || 'development';
var connection = require('./knexfile')[environment];
var knex = require('knex')(connection);
var bookshelf = require('bookshelf')(knex);
var GHProjects = require('./models/ghprojects')(bookshelf);
var HNPosts = require('./models/hnposts')(bookshelf);


var hn_api_host = 'hacker-news.firebaseio.com';
var post_details_url_suffix = '.json';
var gh_responses = [];


var httpGet = function(host, path, cb) {
    var options = {
        host: host,
        path: path,
        headers: {'User-Agent': 'Mozilla/5.0'}
    };

    var req = http.get(options, function(res)
    {
        var data = '';
        res.on('data', function(chunk) {
            data += chunk.toString();
        });
        res.on('end', function(){
            cb(data);
        });
    }).on('error', function(e) {
        console.log("Got error: " + e.message);
    });
};

function saveGithubPost(data, hn_data) {
    var post = JSON.parse(data);
    console.log(post.html_url);
    var model = new GHProjects({
      hn_id: hn_data.id,
      hn_url: hn_data.url,
      gh_url: post.html_url,
      gh_name: post.name,
      gh_description: post.description,
      gh_language: post.language
    });
    model.save(undefined, {method: "insert"}).then().catch(function(error) {
      var time = new Date().getTime();
      console.log('error: %s, %s', error, time);
    });

}

function checkPost(data) {
    var post_details = JSON.parse(data);
    var repository_url = /https?:\/\/github.com(\/.*?\/[^\/]*).*?/.exec(
        post_details.url);
    if (repository_url) {
        httpGet('api.github.com', '/repos' + repository_url[1],
          function(gh_api_data) {
            saveGithubPost(gh_api_data, post_details);
          }
        );
    }
}

function processHNPosts(data) {
    var current_time = new Date();
    var top_list = JSON.parse(data);
    top_list.forEach(function(entry) {
      var model = new HNPosts({ id: entry, retrievedAt: current_time });
      model.save(undefined, {method: "insert"}).then(function() {
        httpGet(hn_api_host,
                '/v0/item/' + entry + post_details_url_suffix, checkPost);
      }).catch(function(error) {
        var time = new Date().getTime();
        console.log('error: %s, %s', error, time);
      });
    });
}

httpGet(hn_api_host, '/v0/topstories.json', processHNPosts);