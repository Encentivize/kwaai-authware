var hasher = require('password-hash-and-salt');
var crypto=require("crypto");


var tokenAccessService=function(options){
    _globalOptions=options;
    var connectionString=null;
    var connectionOptions=null;
    if (options.connection.connectionString){connectionString=options.connection.connectionString;}
    if (options.connection.connectionOptions){connectionString=options.connection.connectionOptions;}

    var kwaaiCrud=require("kwaai-crud").crudTools(connectionString,connectionOptions);

    this.createToken=function(options,callback){
        var id = crypto.randomBytes(20).toString('hex');
        function tokenInserted(err,insertedToken){
            if (err){return callback(err)}
            return callback(null,insertedToken)
        }

        var expiryDate = new Date();
        expiryDate.setMinutes(expiryDate.getMinutes() + options.validMinutes);
        var token={
            tenant:options.tenant,
            token:id,
            dateCreated:new Date(),
            expiryDate:expiryDate,
            user:options.user
        }
        kwaaiCrud.insert({collection:_globalOptions.tokenCollection,data:token,validate:false,coerce:false},tokenInserted);

    }

    this.getValidToken=
    function(token,callback){

        function tokenRetrieved(err,token){
            if (err){return callback(err)}
            if (!token){return callback(null,null)}
            if (token.length==0){return callback(null,null)}

            return callback(null,token[0]);
        }
        kwaaiCrud.getByQuery({collection:_globalOptions.tokenCollection,rawQuery:{find:{token:token,expiryDate:{$gte: new Date()}}}},tokenRetrieved)
    }

}

var service= function(options){
    return new tokenAccessService(options);
}

