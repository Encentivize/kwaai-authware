var hasher = require('password-hash-and-salt');
var kwaaiCrud=require("kwaai-crud");
var crypto=require("crypto");

var _globalOptions={};

var multiTenantTools={
    createToken:
        function(options,callback){

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

    ,getValidToken:
        function(token,callback){

            function tokenRetrieved(err,token){
                if (err){return callback(err)}
                if (!token){return callback(null,null)}
                if (token.length==0){return callback(null,null)}

                return callback(null,token[0]);
            }
            kwaaiCrud.getByQuery({collection:_globalOptions.tokenCollection,rawQuery:{token:token,expiryDate:{$gte: new Date()}}},tokenRetrieved)
        }

}

var service= function(options){
    _globalOptions=options;
    return multiTenantTools;
}

module.exports=service;
